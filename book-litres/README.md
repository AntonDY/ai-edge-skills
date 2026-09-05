# book-litres-v5

Версия с plain-string return.

Ключевые изменения:
- ai_edge_gallery_get_result() возвращает обычную строку;
- никакого object return;
- никакого JSON.stringify() для рабочего результата;
- web-search fallback запрещён в SKILL.md;
- JS сам ищет URL LitRes;
- JS сам получает страницу книги и /reviews/;
- модель получает компактный текстовый протокол FOUND=YES / FOUND=NO.
