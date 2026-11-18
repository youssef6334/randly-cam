#!/usr/bin/env python3
"""Deploy the latest successful Azure commit to the owner's Oracle fallback.

Uses the public repository, not GitHub/SSH credentials. Runtime secrets and
moderation data stay outside releases. A failed health check restores the old app.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request

HOME = Path('/home/ubuntu')
RUNTIME = HOME / 'randly-runtime'
RELEASES = HOME / 'randly-releases'
LIVE = HOME / 'randly'
REPOSITORY = 'youssef6334/randly-cam'
APP_FILES = ['server.js', 'security.js', 'moderation.js', 'ai-chat.js', 'ai-personas.js',
             'badwords.txt', 'package.json', 'package-lock.json', 'build-info.json']


def get_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Randly-Oracle-Sync', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def run(args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True, timeout=180)


def health(port, revision=None):
    try:
        data = get_json(f'http://127.0.0.1:{port}/healthz')
        return data.get('ok') is True and (revision is None or data.get('revision') == revision)
    except Exception:
        return False


def wait_healthy(port, revision=None):
    for _ in range(30):
        if health(port, revision):
            return True
        time.sleep(0.5)
    return False


def prepare_release(revision):
    if shutil.disk_usage(HOME).free < 1024 ** 3:
        raise RuntimeError('Less than 1 GiB available; keeping the current release')
    release = RELEASES / revision
    source = release / 'source'
    app = release / 'app'
    release.mkdir(parents=True, exist_ok=True)
    source.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=release, suffix='.tar.gz') as archive:
        url = f'https://codeload.github.com/{REPOSITORY}/tar.gz/{revision}'
        request = urllib.request.Request(url, headers={'User-Agent': 'Randly-Oracle-Sync'})
        with urllib.request.urlopen(request, timeout=45) as response:
            total = 0
            while chunk := response.read(65536):
                total += len(chunk)
                if total > 50 * 1024 ** 2:
                    raise RuntimeError('Unexpectedly large source archive')
                archive.write(chunk)
        archive.flush()
        with tarfile.open(archive.name) as tar:
            for member in tar.getmembers():
                if not (member.isfile() or member.isdir()):
                    raise RuntimeError('Source archive contains a special file')
                parts = Path(member.name).parts
                if len(parts) < 2:
                    continue
                member.name = str(Path(*parts[1:]))
                tar.extract(member, source, filter='data')
    run(['npm', 'ci'], source)
    for command in ['build:articles', 'build:seo', 'build:assets']:
        run(['npm', 'run', command], source)
    run(['node', 'tools/build-release-info.js', revision], source)
    run(['npm', 'prune', '--omit=dev'], source)
    app.mkdir(exist_ok=True)
    for name in APP_FILES:
        shutil.copy2(source / name, app / name)
    shutil.copytree(source / 'public', app / 'public', dirs_exist_ok=True)
    # npm ci reconstructs dependencies from the same lockfile on ARM.
    if (app / 'node_modules').exists():
        shutil.rmtree(app / 'node_modules')
    shutil.move(str(source / 'node_modules'), app / 'node_modules')
    return app


def preflight(app, revision):
    env = os.environ.copy()
    env.update({'PORT': '3120', 'BIND_HOST': '127.0.0.1', 'NODE_ENV': 'production',
                'DATA_DIR': str(RUNTIME / 'preflight-data'), 'GROQ_API_KEY': '', 'GEMINI_API_KEY': ''})
    with (RUNTIME / 'preflight.log').open('w') as log:
        process = subprocess.Popen(['node', '--env-file=' + str(RUNTIME / 'app.env'), 'server.js'],
                                   cwd=app, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            if not wait_healthy(3120, revision):
                raise RuntimeError('Isolated release health check failed')
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def point_live(target):
    temporary = HOME / 'randly.next'
    if temporary.is_symlink():
        temporary.unlink()
    elif temporary.exists():
        raise RuntimeError('Unexpected non-symlink at deployment switch path')
    temporary.symlink_to(target, target_is_directory=True)
    os.replace(temporary, LIVE)


def restart_app():
    run(['pm2', 'startOrRestart', str(RUNTIME / 'ecosystem.config.cjs'), '--only', 'randly', '--update-env'])


def deploy(revision):
    app = prepare_release(revision)
    preflight(app, revision)
    old_target = LIVE.resolve() if LIVE.is_symlink() else LIVE
    if LIVE.exists() and not LIVE.is_symlink():
        old_target = RELEASES / ('legacy-' + time.strftime('%Y%m%d-%H%M%S'))
        LIVE.rename(old_target)
    try:
        point_live(app)
        restart_app()
        if not wait_healthy(3000, revision):
            raise RuntimeError('Production health check failed')
        run(['pm2', 'save'])
    except Exception:
        point_live(old_target)
        restart_app()
        if not wait_healthy(3000):
            raise RuntimeError('Deployment failed; rollback also needs attention')
        raise
    print('Oracle synchronized to successful Azure release:', revision, flush=True)


def main():
    os.umask(0o077)
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    RELEASES.mkdir(mode=0o700, exist_ok=True)
    if not (RUNTIME / 'app.env').is_file():
        raise RuntimeError('Private runtime configuration is required')
    with (RUNTIME / 'deployment.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        url = f'https://api.github.com/repos/{REPOSITORY}/actions/workflows/main_randly.yml/runs?branch=main&event=push&per_page=1'
        runs = get_json(url).get('workflow_runs', [])
        if not runs or runs[0].get('status') != 'completed' or runs[0].get('conclusion') != 'success':
            print('Latest Azure deployment has not succeeded; preserving Oracle release')
            return
        revision = runs[0].get('head_sha', '')
        if not re.fullmatch('[a-f0-9]{40}', revision):
            raise RuntimeError('Invalid successful commit')
        if health(3000, revision):
            print('Oracle is already synchronized:', revision)
            return
        failed_file = RUNTIME / 'last-deployment-failure.json'
        if failed_file.exists():
            failed = json.loads(failed_file.read_text())
            if failed.get('revision') == revision and time.time() - failed.get('time', 0) < 1800:
                print('Failed release is cooling down; preserving current app')
                return
        try:
            deploy(revision)
        except Exception:
            failed_file.write_text(json.dumps({'revision': revision, 'time': time.time()}))
            raise


if __name__ == '__main__':
    main()
