# HƯỚNG DẪN DEPLOY HUSTBUS LÊN VPS UBUNTU (CHI TIẾT TỪNG BƯỚC)

Tài liệu này hướng dẫn deploy dự án **HustBus** lên **VPS Ubuntu** (khuyến nghị **Ubuntu 22.04 LTS** hoặc **Ubuntu 24.04 LTS**) theo kiểu production, gồm:

- **Frontend**: `HustBus_FrontEnd` (React/Vite) → build ra static và serve bằng **Nginx**
- **Backend**: `HustBus_Backend` (Node/Express + Prisma) → chạy bằng **PM2**
- **FastAPI**: `fastapi/` (ferrobus) → chạy bằng **Docker** (có sẵn `fastapi/docker-compose.yml`)
- **Postgres + Redis**: chạy bằng **Docker** (dễ setup, dễ backup)

> **Gợi ý cấu hình VPS**: tối thiểu **8GB RAM** (FastAPI load model rất nặng), khuyến nghị 16GB nếu dữ liệu lớn.
> 
> **Áp dụng cho**: VPS Ubuntu từ các nhà cung cấp (DigitalOcean, Vultr, Linode, Contabo, AWS EC2, Google Cloud, Azure...).

---

## 0) Xác định Ubuntu version

Chạy trên VPS:

```bash
cat /etc/os-release
```

- **Ubuntu 22.04**: thường có `VERSION_ID="22.04"`
- **Ubuntu 24.04**: thường có `VERSION_ID="24.04"`

---

## 0.1) Nếu bạn đang dùng Ubuntu 22.04/24.04 (copy/paste nhanh)

Bạn có thể chạy nhanh các lệnh sau để cài tool nền (git + docker + compose):

```bash
# 1) Tool cơ bản
sudo apt-get update -y
sudo apt-get install -y git curl unzip ca-certificates
git --version

# 2) Docker Engine + Docker Compose plugin (docker compose ...)
# (Cách chuẩn theo Docker, ổn định cho production)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  ${UBUNTU_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

# cho phép user hiện tại dùng docker không cần sudo (đăng xuất/đăng nhập lại nếu cần)
sudo usermod -aG docker "$USER"
newgrp docker

docker --version
docker compose version
```

---

## 0.2) Chuẩn bị trước khi deploy

### 0.2.1 Firewall (UFW)
Nếu VPS của bạn bật UFW (Ubuntu Firewall), cần mở các port:

```bash
# Kiểm tra UFW
sudo ufw status

# Nếu UFW đang active, mở port cần thiết:
sudo ufw allow 22/tcp    # SSH (BẮT BUỘC, tránh bị khóa)
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (nếu dùng SSL)

# Nếu dùng port riêng cho Nginx (ví dụ 8082):
# sudo ufw allow 8082/tcp
```

> **Lưu ý**: Nếu VPS provider có firewall riêng (ví dụ DigitalOcean Cloud Firewalls, Vultr Firewall), cấu hình tương tự trên panel của họ.

### 0.2.2 Domain (khuyến nghị)
- Nếu có domain: trỏ **A record** về **Public IP** của VPS (ví dụ: `hustbus.yourdomain.com` → `123.45.67.89`)
- Kiểm tra DNS đã trỏ đúng: `nslookup hustbus.yourdomain.com` hoặc `dig +short hustbus.yourdomain.com`

---

## 1) SSH vào VPS từ máy local

### 1.1 Nếu VPS dùng SSH key (khuyến nghị)

**PowerShell (Windows):**
```powershell
ssh -i "C:\path\to\your-key.pem" username@<VPS_PUBLIC_IP>
```

**Git Bash/Linux/macOS:**
```bash
ssh -i ~/.ssh/your-key.pem username@<VPS_PUBLIC_IP>
```

> **Lưu ý về username**:
> - Ubuntu VPS thường dùng `ubuntu` hoặc `root`
> - VPS custom có thể là username bạn tự đặt (ví dụ `vandinh`, `admin`)
> - Xem email setup VPS từ provider để biết user mặc định

### 1.2 Nếu VPS dùng password

```bash
ssh username@<VPS_PUBLIC_IP>
# Nhập password khi được hỏi
```

> Nếu bị lỗi permission key (Windows hay gặp), thử:
```powershell
icacls "C:\path\to\your-key.pem" /inheritance:r
icacls "C:\path\to\your-key.pem" /grant:r "$env:USERNAME:(R)"
```

---

## 2) Cập nhật hệ thống + cài tool cơ bản

> **Lưu ý về firewall**: VPS Ubuntu có thể có **UFW** (Ubuntu Firewall) bật sẵn. Nếu bạn đã mở port ở bước 0.2.1, bỏ qua phần này. Nếu chưa, nhớ mở port **22/80/443** để không bị khóa SSH hoặc web không truy cập được.

### 2.1 Ubuntu (apt)
```bash
sudo apt-get update -y
sudo apt-get install -y git curl unzip ca-certificates
```

> Nếu bạn gặp lỗi `bash: git: command not found` thì bạn đang chưa chạy bước này hoặc cài thiếu `git`.

### 2.2 Tránh xung đột port (khi server đã host web/app khác)

Nếu bạn chạy `ss -tulpn` thấy **80/5000/3001...** đã bị service khác chiếm, **KHÔNG nên dùng lại các port đó** cho HustBus. Có 2 cách:

#### **Cách A (khuyến nghị): Bạn đã có domain riêng cho HustBus**

- Vẫn dùng `listen 80/443` trong Nginx config
- Cấu hình `server_name hustbus.yourdomain.com` (virtual host)
- Nginx sẽ tự động phân biệt theo domain: request tới `hustbus.yourdomain.com` → HustBus, request tới domain khác → site cũ
- **Ưu điểm**: chuẩn production, dùng được SSL (Certbot), URL "sạch" (không cần ghi port)
- **Bắt buộc**: domain phải trỏ (DNS A record) về IP public của server

#### **Cách B: Không có domain (chỉ dùng IP)**

- Cho HustBus chạy trên **port riêng**, ví dụ:
  - **Frontend (Nginx)**: `8082`
  - **Backend (Node)**: `4000` (giữ mặc định nếu chưa bị chiếm)
  - **FastAPI**: `8000` (giữ mặc định nếu chưa bị chiếm)
- Truy cập bằng: `http://<IP>:8082`
- **Nhược điểm**: không dùng được Certbot/SSL tự động, URL có thêm `:8082`

> **Nếu bạn đã có domain → dùng Cách A.** Hướng dẫn bên dưới (phần 9.3) sẽ cung cấp cả 2 config mẫu.

Nếu bạn bật UFW và dùng Cách B (port riêng 8082):
```bash
sudo ufw allow 8082/tcp
```

---

## 3) Cài Docker + Docker Compose plugin

### 3.1 Ubuntu (cài Docker theo repo chính thức)

```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  ${UBUNTU_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

---

## 4) Clone source code lên server

Chọn thư mục cài đặt, ví dụ `/opt`:

```bash
cd /opt
sudo mkdir -p hustbus && sudo chown -R $USER:$USER hustbus
cd hustbus
git clone https://github.com/Chien0903/HustBus.git .
```

> **`$USER`** tự động lấy username hiện tại (ví dụ `vandinh`, `ubuntu`, ...). Nếu bạn muốn chỉ định rõ: `sudo chown -R vandinh:vandinh hustbus`

> Nếu repo private: dùng deploy key hoặc `git clone` qua HTTPS + PAT.

Nếu vẫn báo `git: command not found`, chạy:

```bash
sudo apt-get update -y
sudo apt-get install -y git
git --version
```

---

## 5) Dựng Postgres + Redis bằng Docker (production)

> Nếu bạn **dùng DB cloud (Neon/RDS)** thì **KHÔNG cần dựng Postgres local**. Bạn có thể:
> - Dựng **Redis** (khuyến nghị để refresh token persist + search history TTL).
> - Bỏ service `postgres` trong compose (hoặc không chạy bước này), và đặt `DATABASE_URL` trỏ về Neon/RDS.

Tạo thư mục data persistent:
```bash
cd /opt/hustbus
mkdir -p infra/postgres-data infra/redis-data
```

Tạo file compose: `infra/docker-compose.infra.yml`

```yaml
version: "3.8"
services:
  postgres:
    image: postgres:16
    container_name: hustbus-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: hustbus
      POSTGRES_USER: hustbus
      POSTGRES_PASSWORD: CHANGE_ME_STRONG_PASSWORD
    ports:
      - "5432:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: hustbus-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - ./redis-data:/data
```

Chạy infra:
```bash
cd /opt/hustbus/infra
docker compose -f docker-compose.infra.yml up -d
docker ps
```

---

## 6) Setup database schema + import GTFS data

### 6.1 Cài Node.js (khuyến nghị Node 20+) + pnpm
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

sudo corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

### 6.2 Tạo `.env` cho Backend
Tạo file: `/opt/hustbus/HustBus_Backend/.env`

```env
# Server
NODE_ENV=production
PORT=4000

# Database
# - Nếu dùng Postgres local (docker ở bước 5):
# DATABASE_URL="postgresql://hustbus:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/hustbus?schema=public"
#
# - Nếu dùng Neon (ví dụ):
# DATABASE_URL="postgresql://neondb_owner:<PASSWORD>@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# JWT
JWT_SECRET="CHANGE_ME_LONG_RANDOM"
JWT_REFRESH_SECRET="CHANGE_ME_LONG_RANDOM_2"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Redis (tuỳ chọn - nếu không set thì refresh token sẽ không persist)
REDIS_URL="redis://127.0.0.1:6379"

# OpenRouteService (bắt buộc nếu dùng map/đi bộ)
ORS_API_KEY="YOUR_ORS_KEY"

# FastAPI routing service
ROUTING_API_URL="http://127.0.0.1:8000"
ROUTING_API_TIMEOUT=30000
```

### 6.3 Prisma generate + migrate (production)
```bash
cd /opt/hustbus/HustBus_Backend
npm ci
npx prisma generate

# Production migrate:
npx prisma migrate deploy
```

### 6.4 Import dữ liệu GTFS vào Postgres
Repo có sẵn SQL trong: `HustBus_Backend/db_migration/db_data/`

> Nếu bạn dùng Neon/RDS: bạn vẫn cần import dữ liệu GTFS lên DB cloud (trừ khi DB của bạn đã có sẵn dữ liệu).

Chạy theo thứ tự (thường là routes → stops → trips → stopTimes):
```bash
cd /opt/hustbus/HustBus_Backend/db_migration/db_data

# ví dụ:
psql "postgresql://hustbus:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/hustbus" -f routes.sql
psql "postgresql://hustbus:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/hustbus" -f stops.sql
psql "postgresql://hustbus:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/hustbus" -f trips.sql
psql "postgresql://hustbus:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/hustbus" -f stopTimes.sql
```

> Nếu server chưa có `psql`, cài:
```bash
sudo apt-get update -y
sudo apt-get install -y postgresql-client
```

Nếu import lên Neon/RDS, thay URL ở các lệnh `psql` thành `DATABASE_URL` của bạn (nhớ giữ `sslmode=require` nếu Neon yêu cầu).

---

## 7) Chạy FastAPI bằng Docker

FastAPI đã có sẵn `fastapi/docker-compose.yml`.

```bash
cd /opt/hustbus/fastapi
docker compose up -d
docker ps
```

Kiểm tra:
```bash
curl -I http://127.0.0.1:8000/docs
```

> Nếu FastAPI OOM / bị kill: cần tăng RAM instance hoặc cấu hình swap.

---

## 8) Chạy Backend Node bằng PM2

### 8.1 Cài PM2
```bash
sudo npm i -g pm2
pm2 -v
```

### 8.2 Start backend
```bash
cd /opt/hustbus/HustBus_Backend
# Khuyến nghị: chạy theo script "start" trong package.json (tương đương: node server.js)
pm2 start npm --name hustbus-backend -- start
pm2 save
pm2 status
```

Tạo startup service:
```bash
pm2 startup systemd -u $USER --hp $HOME
```
Copy lệnh PM2 in ra và chạy với `sudo` theo hướng dẫn.

> **`$USER`** và **`$HOME`** tự động lấy username và home directory hiện tại (ví dụ `vandinh` + `/home/vandinh`).

Kiểm tra:
```bash
curl http://127.0.0.1:4000/health
```

### 8.3 (Tuỳ chọn) Chạy Backend bằng systemd (thay cho PM2)

Nếu bạn muốn quản lý service theo chuẩn Ubuntu (không cần PM2), bạn có thể tạo systemd service:

Tạo file: `/etc/systemd/system/hustbus-backend.service`

```ini
[Unit]
Description=HustBus Backend (Node/Express)
After=network.target

[Service]
Type=simple
User=vandinh
WorkingDirectory=/opt/hustbus/HustBus_Backend
EnvironmentFile=/opt/hustbus/HustBus_Backend/.env
ExecStart=/usr/bin/node /opt/hustbus/HustBus_Backend/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> **Lưu ý**: Thay `User=vandinh` bằng username thực tế của bạn (chạy `whoami` để xem).

Enable + start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hustbus-backend
sudo systemctl status hustbus-backend --no-pager
```

Xem log:
```bash
journalctl -u hustbus-backend -n 200 --no-pager
```

---

## 9) Build Frontend và serve bằng Nginx

### 9.1 Tạo env cho Frontend
Tạo file: `/opt/hustbus/HustBus_FrontEnd/.env.production`

**Nếu bạn dùng Cấu hình A (có domain, chạy port 80/443):**

```env
# Nếu chưa có SSL (HTTP):
VITE_API_URL=http://hustbus.example.com

# Nếu đã cấp SSL (HTTPS - khuyến nghị):
# VITE_API_URL=https://hustbus.example.com
```

**Nếu bạn dùng Cấu hình B (port riêng 8082):**

```env
VITE_API_URL=http://<IP_PUBLIC>:8082
```

> **Lưu ý**: 
> - Frontend cần biết URL đầy đủ để gọi API. Nếu dùng domain + port 80/443 thì không cần ghi port.
> - Sau khi sửa `.env.production`, nhớ **build lại** (`pnpm build`).

### 9.2 Build
```bash
cd /opt/hustbus/HustBus_FrontEnd
pnpm install
pnpm build
```

Sau build, thư mục output là `dist/`.

### 9.3 Cài Nginx + cấu hình reverse proxy
#### Ubuntu
```bash
sudo apt-get update -y
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Tạo config: `/etc/nginx/conf.d/hustbus.conf`

**Cấu hình A (khuyến nghị): Bạn đã có domain riêng**

```nginx
server {
    listen 80;
    server_name www.hustbus.app hustbus.app;  

    root /opt/hustbus/HustBus_FrontEnd/dist;
    index index.html;

    # Frontend SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Giải thích**: Nginx phân biệt các site theo `server_name`. Nếu bạn đã có site khác chạy port 80 với domain khác (hoặc IP), HustBus sẽ chỉ xử lý request tới `hustbus.example.com`, không đụng site cũ.

**Cấu hình B (nếu KHÔNG có domain): Dùng port riêng**

```nginx
server {
    listen 8082;  # Port trống (tránh 80/3001/5000 đã bị chiếm)
    server_name _;

    root /opt/hustbus/HustBus_FrontEnd/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Lưu ý**: Nếu dùng port riêng (8082), bạn phải:
> - Mở port 8082 trong Firewall (UFW hoặc firewall của VPS provider).
> - Đặt `VITE_API_URL=http://<IP>:8082` trong `.env.production` (FE).

Enable site:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

> **LƯU Ý QUAN TRỌNG**:
> - **Nếu bạn có domain và muốn dùng SSL (Certbot)**: BẮT BUỘC dùng **Cấu hình A** (listen 80 + `server_name` là domain thật).
> - Certbot cần port 80 mở và domain trỏ đúng IP để xác minh. Nếu dùng port riêng (8082), Certbot sẽ không hoạt động.
> - Sau khi chạy Certbot thành công, Nginx config sẽ tự động thêm `listen 443 ssl` và redirect HTTP → HTTPS.

---

## 10) (Tuỳ chọn) Bật HTTPS bằng Let's Encrypt

Chỉ làm nếu bạn có domain trỏ về VPS.

```bash
# Ubuntu
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

# Cấp SSL (thêm -d www.<domain> nếu bạn dùng www)
#
# LƯU Ý:
# - Tham số -d chỉ nhận "tên miền", KHÔNG có https:// và KHÔNG có dấu /
# - Let's Encrypt dùng HTTP-01 => VPS phải truy cập được từ Internet qua port 80
# - Domain phải có bản ghi DNS A (hoặc AAAA) trỏ về đúng Public IP của VPS
#   (Lưu ý: cần record cho cả domain gốc `@` = hustbus.app và subdomain `www` nếu bạn xin cert cho cả 2)
# - Nếu Certbot báo:
#   "Timeout during connect (likely firewall problem)"
#   thì gần như chắc chắn là do một trong các nguyên nhân sau:
#   - UFW hoặc Firewall VPS chưa mở port 80/443
#   - Provider firewall (DigitalOcean/Vultr Cloud Firewall) chưa mở port 80/443
#   - Nginx chưa chạy hoặc chưa listen :80
#   Checklist kiểm tra nhanh:
#   - Trên VPS: `sudo ufw status` (phải allow 80/443)
#   - Trên VPS: `sudo ss -lntp | egrep ':80|:443'` (nginx phải LISTEN :80)
#   - Từ máy tính cá nhân: `curl -I http://hustbus.yourdomain.com` phải trả về HTTP response (không timeout)
#
# Ví dụ đúng:
# sudo certbot --nginx -d hustbus.app -d www.hustbus.app
sudo certbot --nginx -d <YOUR_DOMAIN>
```

---

## 11) Checklist kiểm tra sau deploy

### 11.1 Kiểm tra containers
```bash
docker ps
```

### 11.2 Kiểm tra backend
```bash
pm2 logs hustbus-backend --lines 200
curl http://127.0.0.1:4000/health
```

### 11.3 Kiểm tra FastAPI
```bash
curl -I http://127.0.0.1:8000/docs
docker logs -n 200 raptor-api
```

### 11.4 Kiểm tra web từ bên ngoài
- Mở trình duyệt:
  - **Nếu dùng Cấu hình A (domain + port 80)**: `http://hustbus.example.com` (hoặc `https://...` nếu đã cấp SSL)
  - **Nếu dùng Cấu hình B (port riêng 8082)**: `http://<IP_PUBLIC>:8082`

---

## 11.5) Pull code mới về VPS & redeploy (khi bạn cập nhật code trên GitHub)

> Giả sử bạn đã clone repo vào: `/opt/hustbus`

### A) Update nhanh (trường hợp phổ biến)

```bash
# 1) Kéo code mới
cd /opt/hustbus
git status
git pull

# 2) Backend: update deps + migrate DB + restart PM2
cd /opt/hustbus/HustBus_Backend
npm ci
npx prisma generate
npx prisma migrate deploy
pm2 restart hustbus-backend

# 3) Frontend: build lại (đảm bảo .env.production đúng domain)
cd /opt/hustbus/HustBus_FrontEnd
pnpm install
pnpm build
sudo nginx -t && sudo systemctl reload nginx

# 4) FastAPI (chỉ khi bạn có sửa code trong /fastapi)
cd /opt/hustbus/fastapi
docker compose up -d --build
```

### B) Nếu `git pull` báo conflict hoặc bạn lỡ sửa code trực tiếp trên server

```bash
cd /opt/hustbus
git status

# Cách 1: tạm cất thay đổi rồi pull
git stash -u
git pull

# (tuỳ chọn) lấy lại thay đổi đã stash nếu bạn cần
# git stash pop
```

> **Khuyến nghị**: hạn chế sửa code trực tiếp trên VPS; nên sửa trên máy local rồi push lên GitHub.

## 12) Các biến môi trường quan trọng (tóm tắt)

### Backend (`HustBus_Backend/.env`)
- `DATABASE_URL` (bắt buộc)
- `JWT_SECRET` (bắt buộc)
- `JWT_REFRESH_SECRET` (khuyến nghị bắt buộc khi production)
- `REDIS_URL` (tuỳ chọn nhưng nên có để refresh token “persist”)
- `ORS_API_KEY` (bắt buộc nếu dùng ORS endpoints / walking route)
- `ROUTING_API_URL` (bắt buộc để gọi FastAPI)

### Frontend (`HustBus_FrontEnd/.env.production`)
- `VITE_API_URL` (bắt buộc, ví dụ `https://your-domain.com`)

---

## 13) Troubleshooting nhanh

### Backend chạy nhưng FE gọi API lỗi CORS / 404
- Kiểm tra `VITE_API_URL` có đúng domain/IP không.
- Kiểm tra Nginx `location /api/` có `proxy_pass` đúng port `4000`.

### FastAPI chạy lâu / OOM
- Tăng RAM instance hoặc thêm swap.
- Đảm bảo file OSM `fastapi/app/gtfs_hanoi/hanoi_extended_v2.osm.pbf` tồn tại.

### Prisma migrate lỗi
- Kiểm tra `DATABASE_URL` đúng user/pass/db chưa.
- Đảm bảo Postgres container đang chạy và port 5432 open nội bộ.
