#!/bin/sh
#
# Generate a deterministic port number from project name
#
# Usage: ./scripts/get-port.sh [project_name]
#        ./scripts/get-port.sh           # uses DB_NAME or defaults to 'myapp'
#
# Port range: 3000-3999 (1000 possible ports)
# Same project name always returns the same port

PROJECT_NAME="${1:-${DB_NAME:-myapp}}"

# Simple hash: sum of ASCII values mod 1000, then add 3000
hash=0
for i in $(echo "$PROJECT_NAME" | fold -w1); do
  ascii=$(printf '%d' "'$i")
  hash=$((hash + ascii))
done

port=$((3000 + (hash % 1000)))

echo "$port"
