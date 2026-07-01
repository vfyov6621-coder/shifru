#!/bin/bash
set -e

BASE="http://127.0.0.1:3000"
echo "=== 0. Checking server ==="
curl -s "$BASE/api" -o /dev/null -w "Server status: HTTP %{http_code}\n" || { echo "Server not responding"; exit 1; }
echo ""
echo "=== 1. Регистрация админа ==="
R1=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123","password2":"admin123"}')
echo "$R1" | python3 -m json.tool 2>/dev/null || echo "$R1"
TOKEN=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)
echo "TOKEN: ${TOKEN:0:30}..."

echo ""
echo "=== 2. Регистрация userB ==="
R2=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"login":"userB","password":"userB123","password2":"userB123"}')
echo "$R2" | python3 -m json.tool 2>/dev/null || echo "$R2"
B_ID=$(echo "$R2" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)

echo ""
echo "=== 3. Список пользователей (admin) ==="
curl -s "$BASE/api/admin/users" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 4. Верификация userB ==="
curl -s -X POST "$BASE/api/admin/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$B_ID\",\"action\":\"verify\"}" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 5. Вход под userB ==="
R5=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"login":"userB","password":"userB123"}')
echo "$R5" | python3 -m json.tool 2>/dev/null || echo "$R5"
B_TOKEN=$(echo "$R5" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)

echo ""
echo "=== 6. Верификация admin самим собой ==="
ADMIN_ID=$(echo "$R1" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null)
curl -s -X POST "$BASE/api/admin/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ADMIN_ID\",\"action\":\"verify\"}" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 7. Создание чата (групповой) ==="
R7=$(curl -s -X POST "$BASE/api/channels" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ABCD Group\",\"password\":\"admin123\",\"memberIds\":[\"$B_ID\"]}")
echo "$R7" | python3 -m json.tool 2>/dev/null || echo "$R7"
CHAT_ID=$(echo "$R7" | python3 -c "import sys,json; print(json.load(sys.stdin)['chat']['id'])" 2>/dev/null)
echo "CHAT_ID: $CHAT_ID"

echo ""
echo "=== 8. Шифрование: 'привет мир' ==="
R8=$(curl -s -X POST "$BASE/api/encrypt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"data\":\"привет мир\",\"chatId\":\"$CHAT_ID\",\"password\":\"admin123\"}")
echo "$R8" | python3 -m json.tool 2>/dev/null || echo "$R8"
ENC=$(echo "$R8" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])" 2>/dev/null)
CHAIN=$(echo "$R8" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))" 2>/dev/null)
echo "ENCRYPTED: ${ENC:0:50}..."
echo "CHAIN: $CHAIN"

echo ""
echo "=== 9. Дешифровка ==="
R9=$(curl -s -X POST "$BASE/api/decrypt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"encrypted\":\"$ENC\",\"chatId\":\"$CHAT_ID\",\"chain\":$CHAIN,\"password\":\"admin123\"}")
echo "$R9" | python3 -m json.tool 2>/dev/null || echo "$R9"

echo ""
echo "=== 10. Второе шифрование того же текста (должно отличаться!) ==="
R10=$(curl -s -X POST "$BASE/api/encrypt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"data\":\"привет мир\",\"chatId\":\"$CHAT_ID\",\"password\":\"admin123\"}")
ENC2=$(echo "$R10" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])" 2>/dev/null)
CHAIN2=$(echo "$R10" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))" 2>/dev/null)
echo "ENCRYPTED2: ${ENC2:0:50}..."
echo "CHAIN2: $CHAIN2"
echo ""
if [ "$ENC" = "$ENC2" ]; then
  echo "❌ ОШИБКА: шифротексты одинаковы!"
else
  echo "✅ Шифротексты разные (как и должно быть)"
fi

echo ""
echo "=== 11. Дешифровка второго ==="
R11=$(curl -s -X POST "$BASE/api/decrypt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"encrypted\":\"$ENC2\",\"chatId\":\"$CHAT_ID\",\"chain\":$CHAIN2,\"password\":\"admin123\"}")
echo "$R11" | python3 -m json.tool 2>/dev/null || echo "$R11"

echo ""
echo "=== 12. Проверка лимитов ==="
curl -s "$BASE/api/me" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null

echo ""
echo "=== 13. Создание API-ключа ==="
R13=$(curl -s -X POST "$BASE/api/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-key"}')
echo "$R13" | python3 -m json.tool 2>/dev/null || echo "$R13"
API_KEY=$(echo "$R13" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])" 2>/dev/null)

echo ""
echo "=== 14. Шифрование через API-ключ ==="
R14=$(curl -s -X POST "$BASE/api/encrypt" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"data\":\"тест через API\",\"chatId\":\"$CHAT_ID\"}")
echo "$R14" | python3 -m json.tool 2>/dev/null || echo "$R14"
API_ENC=$(echo "$R14" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])" 2>/dev/null)
API_CHAIN=$(echo "$R14" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))" 2>/dev/null)

echo ""
echo "=== 15. Дешифровка через API-ключ ==="
R15=$(curl -s -X POST "$BASE/api/decrypt" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"encrypted\":\"$API_ENC\",\"chatId\":\"$CHAT_ID\",\"chain\":$API_CHAIN}")
echo "$R15" | python3 -m json.tool 2>/dev/null || echo "$R15"

echo ""
echo "=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ==="
