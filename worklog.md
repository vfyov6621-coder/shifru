---
Task ID: 1
Agent: Main Agent
Task: Полная переработка QuantumShield v2 — цепочечное шифрование

Work Log:
- Переработал Prisma схему: User(login), Chat(ownerId+members), RateLimit, убрал VerificationToken
- Переписал crypto.ts: цепочечные преобразования (unicode→binary→decimal→TLS→SSL) + AES-256-GCM внешний слой
- Исправил toBinary/fromBinary для UTF-8 через Buffer (многобайтовые символы)
- Исправил encryptPasswordThroughService на детерминированную (IV от хеша пароля)
- Обновил auth.ts: логин без email, пароль шифруется через сервис→Argon2id, rate limiting
- Обновил все API маршруты: register(3 поля), login, channels, encrypt, decrypt, api-keys, me
- Добавил rate limiting: 90 000/день, 200 000/месяц через RateLimit таблицу
- Перестроил UI: чёрно-белый минимализм, 5 вкладок, 3 поля регистрации
- Интеграционный тест (test_full.ts): ВСЕ ТЕСТЫ ПРОЙДЕНЫ

Stage Summary:
- Цепочечное шифрование: рандомный порядок 5-10 методов, каждый раз разный
- TLS: HMAC-SHA256 stream cipher + XOR, SSL: bit rotation + substitution + XOR
- Два шифрования одного текста → разные цепочки и разные шифртексты ✓
- Дешифровка обоих → исходный текст ✓
- Rate limit: 90000 → 89999 после одного запроса ✓
- Пароль шифруется через сервис перед Argon2id хешированием ✓