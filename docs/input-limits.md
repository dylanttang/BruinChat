# Input length limits

Message text is limited to 4,000 characters; edits must also be nonempty. Each media URL is limited to 2,048 characters, with at most 10 URLs per JSON message. Profile limits: year 32, major 120, goal 1,000, avatar URL 2,048, push token 4,096. Invalid types or oversized values return HTTP 400 before writes.

Mongoose also enforces these field lengths plus username 64, email 254, Google ID 255, and display name 100. Update routes enable validators. This change does not migrate existing records.

Test: `cd server && NODE_PATH=node_modules node --test tests/input-limits.test.js`.
