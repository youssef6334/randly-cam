#!/usr/bin/env python3
"""One-time private runtime setup. Selected application settings arrive on stdin."""
import json
import os
from pathlib import Path
import secrets
import shutil
import sys

os.umask(0o077)
home = Path('/home/ubuntu')
runtime = home / 'randly-runtime'
runtime.mkdir(mode=0o700, exist_ok=True)
runtime.chmod(0o700)
incoming = json.load(sys.stdin)
allowed = {'GROQ_API_KEY', 'GEMINI_API_KEY', 'GROQ_MODEL', 'GEMINI_MODEL',
           'GOOGLE_TRANSLATE_API_KEY', 'AI_WAIT_MS', 'AI_HEALTH_TOKEN'}
if not isinstance(incoming, dict) or set(incoming) - allowed:
    raise ValueError('Unexpected runtime setting')
for value in incoming.values():
    if not isinstance(value, str) or '\n' in value or '\r' in value:
        raise ValueError('Invalid runtime value')
settings_file = runtime / 'app.env'
settings = {}
if settings_file.exists():
    for line in settings_file.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            settings[key] = json.loads(value)
settings.update({key: value for key, value in incoming.items() if value})
settings.update({'NODE_ENV': 'production', 'PORT': '3000', 'BIND_HOST': '127.0.0.1',
                 'DATA_DIR': str(runtime / 'data'), 'TRUSTED_PROXY_CIDRS': '127.0.0.1/32,::1/128',
                 'BEHIND_CLOUDFLARE': 'false',
                 'TURN_URLS': 'turn:129.159.29.111:3478?transport=udp,turn:129.159.29.111:3478?transport=tcp',
                 'TURN_SHARED_SECRET': (runtime / 'turn-shared-secret').read_text().strip()})
settings.setdefault('IP_HASH_SALT', secrets.token_hex(32))
settings.setdefault('AI_HEALTH_TOKEN', secrets.token_hex(32))
data = runtime / 'data'
if not data.exists():
    old_data = home / 'randly' / 'data'
    if old_data.is_dir():
        shutil.copytree(old_data, data)
    else:
        data.mkdir(mode=0o700)
data.chmod(0o700)
settings_file.write_text(''.join(key + '=' + json.dumps(value, ensure_ascii=False) + '\n' for key, value in sorted(settings.items())))
settings_file.chmod(0o600)
config = """module.exports = { apps: [{
  name: 'randly', script: '/home/ubuntu/randly/server.js', cwd: '/home/ubuntu/randly',
  interpreter: '/usr/bin/node', node_args: ['--env-file=/home/ubuntu/randly-runtime/app.env'],
  env: { NODE_ENV: 'production' }, autorestart: true, kill_timeout: 8000
}] };\n"""
(runtime / 'ecosystem.config.cjs').write_text(config)
print('Private runtime prepared; application keys were not displayed.')
