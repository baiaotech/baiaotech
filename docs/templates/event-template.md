---
title: "Nome do evento"
start_date: "2026-08-20"
end_date: "2026-08-21"
kind: "conference"
format: "in-person"
city: "Salvador"
state: "BA"
organizer: "Comunidade XYZ"
venue: "Centro de Convencoes"
ticket_url: "https://..."
categories:
  - "frontend"
featured: false
cover_image: ""
price: "Gratuito"
# source_name: "Sympla Salvador"
# source_url: "https://..."
---

Descricao do evento em Markdown.

Notas:

- datas sempre em `YYYY-MM-DD`
- `categories` deve usar slugs existentes em `src/_data/categories.json`
- `cover_image` pode ficar vazio, usar URL externa ou apontar para `/assets/...`
- se `source_url` for informado, `source_name` tambem precisa ser informado
- o corpo Markdown nao pode ficar vazio
