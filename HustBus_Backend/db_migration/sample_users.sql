-- Sample Users Data
-- Password for all users: "password123"
-- Hashed with bcrypt (10 rounds)
--
-- Requirements:
-- - Extension `pgcrypto` for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, name, email, password, created_at, path_url, role) VALUES
-- Regular users
(
    gen_random_uuid(),
    'Nguyễn Văn An',
    'nguyenvanan@gmail.com',
    '$2b$10$AnTMc3SOYmNzyZLKKvi1tem7mce34feZlkpPMZoR6O.xGOvKZ1cy6',
    NOW() - INTERVAL '30 days',
    NULL,
    'user'
),
(
    gen_random_uuid(),
    'Trần Thị Bình',
    'tranthibinh@gmail.com',
    '$2b$10$8KKKeRzaHQdxnpvIt4vYT.FnHp8Lmyh3lORWjewB1Ynd5n4Euq5GW',
    NOW() - INTERVAL '25 days',
    NULL,
    'user'
),
(
    gen_random_uuid(),
    'Lê Văn Cường',
    'levancuong@gmail.com',
    '$2b$10$mnEO3NtCgRIjUCHcs4bpxu7MoEFpyKfs8AlIHTwg0pmxowJehRqQe',
    NOW() - INTERVAL '20 days',
    NULL,
    'user'
),
(
    gen_random_uuid(),
    'Phạm Thị Dung',
    'phamthidung@gmail.com',
    '$2b$10$A7Nvm8D/O8bWEq3qbesu1elXbRTDl82nwvelVOss51gnh0Xdylsiu',
    NOW() - INTERVAL '15 days',
    NULL,
    'user'
),
(
    gen_random_uuid(),
    'Hoàng Văn Em',
    'hoangvanem@gmail.com',
    '$2b$10$uUk/qcLja1t50XvdnvRPkOyOpKhKOeTs5vmv4qJuCPrimbtqCXJEG',
    NOW() - INTERVAL '10 days',
    NULL,
    'user'
),

-- Admin users
(
    gen_random_uuid(),
    'Admin System',
    'admin@hustbus.vn',
    '$2b$10$t5WG5Otq58h.wvwAtH2liOL0.yvtF/BQk3rg/YD7C6e92/BlWaUmK',
    NOW() - INTERVAL '60 days',
    NULL,
    'admin'
),
(
    gen_random_uuid(),
    'Quản Trị Viên',
    'quantri@hustbus.vn',
    '$2b$10$dkegOGxBO1OXrQr3eztxGukcjwdfIganmAmCgwDpLXOvO6lZVk/wm',
    NOW() - INTERVAL '50 days',
    NULL,
    'admin'
);

-- Allow re-running this script safely (email is UNIQUE)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    password = EXCLUDED.password,
    path_url = EXCLUDED.path_url,
    role = EXCLUDED.role;

-- Note: Replace the password hashes above with actual bcrypt hashes
-- You can generate them using: bcrypt.hash("password123", 10)
