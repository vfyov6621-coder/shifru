---
Task ID: 1
Agent: main
Task: Полная переработка Shifru — цепочечное шифрование, чёрно-белый UI, Firebase

Work Log:
- Проверил текущее состояние проекта (унаследовано от предыдущей сессии)
- Обновил branding: QuantumShield → Shifru во всех файлах
- Обновил шрифты: Geist → Inter + JetBrains Mono (с поддержкой кириллицы)
- Добавил Firebase конфиг (projectId: shifru-75ec7) в .env и src/lib/firebase.ts
- Установил firebase SDK
- Заменил argon2 (native модуль, крашил сервер) на scrypt (встроенный в Node.js, memory-hard, квантово-устойчивый)
- Снизил Prisma query logging только для dev-режима
- Обновил UI: убрал упоминания Argon2id, заменил на scrypt
- Обновил API-ключи: префикс qs_ → shifru_
- Обновил JWT секрет и server key
- Production build: ✅ успешно
- Полный тест 15 шагов: ✅ все прошли

Stage Summary:
- Все API эндпоинты работают корректно
- Цепочечное шифрование (unicode→binary→decimal→TLS→SSL) с переменным порядком ✅
- Регистрация 3 поля (логин, пароль, подтверждение) ✅
- Ручная верификация админом ✅
- Групповые и личные чаты ✅
- API-ключи для внешнего доступа ✅
- Rate limiting (90к/день, 200к/мес) ✅
- Самошифрование паролей через сервис ✅
- Квантовая устойчивость (AES-256-GCM + scrypt + PBKDF2-SHA512) ✅
- Чёрно-белый минималистичный UI с вкладками ✅