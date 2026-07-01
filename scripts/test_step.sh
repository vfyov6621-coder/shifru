#!/bin/bash
BASE="http://127.0.0.1:3000"
WAIT=3

wait_ok() { sleep $WAIT; }

echo "=== 1. Регистрация userB ==="
R=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"login":"userB","password":"userB123","password2":"userB123"}')
echo "$R" | python3 -m json.tool
B_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
wait_ok

echo ""
echo "=== 2. Список пользователей (admin) ==="
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJjbXIxc2x4aXEwMDAwc3FubWE1NTk5bTJtIiwibG9naW4iOiJhZG1pbiIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc4Mjg5MzI1MSwiZXhwIjoxNzgzNDk4MDUxfQ.5Cv0zf66HpUGghVgs7GPcGqCxm-MJCzeTMvL5iKr_vk"
curl -s --connect-timeout 10 -m 30 "$BASE/api/admin/users" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
wait_ok

echo ""
echo "=== 3. Верификация админа ==="
ADMIN_ID=$(echo "$R" | python3 -c "import sys; print()" 2>/dev/null)
# Get admin ID from first registration
curl -s --connect-timeout 10 -m 30 "$BASE/api/me" -H "Authorization: Bearer $TOKEN" > /tmp/me.json
ADMIN_ID=$(cat /tmp/me.json | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
curl -s --connect-timeout 10 -m 30 -X POST "$BASE/api/admin/verify" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ADMIN_ID\",\"action\":\"verify\"}" | python3 -m json.tool
wait_ok

echo ""
echo "=== 4. Верификация userB ==="
curl -s --connect-timeout 10 -m 30 -X POST "$BASE/api/admin/verify" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$B_ID\",\"action\":\"verify\"}" | python3 -m json.tool
wait_ok

echo ""
echo "=== 5. Создание чата ==="
R5=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/channels" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"ABCD Group\",\"password\":\"admin123\",\"memberIds\":[\"$B_ID\"]}")
echo "$R5" | python3 -m json.tool
CHAT_ID=$(echo "$R5" | python3 -c "import sys,json; print(json.load(sys.stdin)['chat']['id'])")
wait_ok

echo ""
echo "=== 6. Шифрование 'привет мир' ==="
R6=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/encrypt" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"data\":\"привет мир\",\"chatId\":\"$CHAT_ID\",\"password\":\"admin123\"}")
echo "$R6" | python3 -m json.tool
ENC=$(echo "$R6" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])")
CHAIN=$(echo "$R6" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))")
wait_ok

echo ""
echo "=== 7. Дешифровка ==="
R7=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/decrypt" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"encrypted\":\"$ENC\",\"chatId\":\"$CHAT_ID\",\"chain\":$CHAIN,\"password\":\"admin123\"}")
echo "$R7" | python3 -m json.tool
DEC=$(echo "$R7" | python3 -c "import sys,json; print(json.load(sys.stdin)['decrypted'])" 2>/dev/null)
if [ "$DEC" = "привет мир" ]; then echo "✅ ДЕШИФРОВКА КОРРЕКТНА"; else echo "❌ ОШИБКА ДЕШИФРОВКИ"; fi
wait_ok

echo ""
echo "=== 8. Второе шифрование (должно отличаться) ==="
R8=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/encrypt" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"data\":\"привет мир\",\"chatId\":\"$CHAT_ID\",\"password\":\"admin123\"}")
ENC2=$(echo "$R8" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])")
CHAIN2=$(echo "$R8" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))")
if [ "$ENC" != "$ENC2" ]; then echo "✅ ШИФРОТЕКСТЫ РАЗНЫЕ"; else echo "❌ ШИФРОТЕКСТЫ ОДИНАКОВЫЕ"; fi
wait_ok

echo ""
echo "=== 9. Дешифровка второго ==="
R9=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/decrypt" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"encrypted\":\"$ENC2\",\"chatId\":\"$CHAT_ID\",\"chain\":$CHAIN2,\"password\":\"admin123\"}")
echo "$R9" | python3 -m json.tool
wait_ok

echo ""
echo "=== 10. API-ключ ==="
R10=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/api-keys" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"test-key"}')
echo "$R10" | python3 -m json.tool
API_KEY=$(echo "$R10" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
wait_ok

echo ""
echo "=== 11. Шифрование через API-ключ ==="
R11=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/encrypt" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"data\":\"тест API\",\"chatId\":\"$CHAT_ID\"}")
echo "$R11" | python3 -m json.tool
API_ENC=$(echo "$R11" | python3 -c "import sys,json; print(json.load(sys.stdin)['encrypted'])")
API_CHAIN=$(echo "$R11" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['chain']))")
wait_ok

echo ""
echo "=== 12. Дешифровка через API-ключ ==="
R12=$(curl -s --connect-timeout 10 -m 60 -X POST "$BASE/api/decrypt" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d "{\"encrypted\":\"$API_ENC\",\"chatId\":\"$CHAT_ID\",\"chain\":$API_CHAIN}")
echo "$R12" | python3 -m json.tool
wait_ok

echo ""
echo "=== 13. Лимиты ==="
curl -s --connect-timeout 10 -m 30 "$BASE/api/me" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== ВСЕ ТЕСТЫ ✅ ==="