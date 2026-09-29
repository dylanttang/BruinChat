# Browser origin allowlist

Set `CORS_ORIGINS` to comma-separated exact origins, for example `https://chat.example.edu`. Production origins must use HTTPS. Add `http://localhost:8081` explicitly for local web development. An empty list denies all browser origins; native requests without Origin remain supported.

HTTP requests and Socket.IO handshakes share the policy. CORS does not replace authentication and does not prevent non-browser clients from making requests. Configure the actual deployed domain before rollout.

Test: `cd server && NODE_PATH=node_modules node --test tests/cors.test.js`.
