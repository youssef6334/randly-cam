# سكريبتات تعديل صفحات public/

اتنقلت من `public/` عشان ما تتنشرش على الموقع. معظمها بيشتغل على المجلد الحالي، فشغّلها من جوه `public/`:

    cd public
    python ../tools/public-scripts/bump_version.py

أي نسخة احتياطية بتتعمل جوه `public/backup_before_mobile_fix/` متجاهَلة في git والسيرفر بيرفض يخدمها.
