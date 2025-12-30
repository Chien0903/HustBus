# HƯỚNG DẪN DEPLOY HUSTBUS LÊN AWS EC2 AMAZON LINUX (CHI TIẾT TỪNG BƯỚC)

Tài liệu này hướng dẫn deploy dự án **HustBus** lên **EC2 Amazon Linux** (Amazon Linux 2 hoặc Amazon Linux 2023) theo kiểu production, gồm:

- **Frontend**: `HustBus_FrontEnd` (React/Vite) → build ra static và serve bằng **Nginx**
- **Backend**: `HustBus_Backend` (Node/Express + Prisma) → chạy bằng **PM2**
- **FastAPI**: `fastapi/` (ferrobus) → chạy bằng **Docker** (có sẵn `fastapi/docker-compose.yml`)
- **Postgres + Redis**: chạy bằng **Docker** (dễ setup, dễ backup)

> Gợi ý cấu hình EC2: **tối thiểu 8GB RAM** (FastAPI load model rất nặng), khuyến nghị 16GB nếu dữ liệu lớn.

---

## 0) Xác định Amazon Linux version (AL2 hay AL2023)

Chạy trên EC2:

```bash
cat /etc/os-release
```

- **Amazon Linux 2 (AL2)**: thường có `VERSION="2"` và có thể dùng `amazon-linux-extras`
- **Amazon Linux 2023 (AL2023)**: thường có `VERSION_ID="2023"` và dùng `dnf`

---

## 0.1) Nếu bạn đang dùng AL2023 + x86_64 (copy/paste nhanh)

Bạn đã cung cấp:
- OS: **Amazon Linux 2023**
- Arch: **x86_64**

Bạn có thể chạy nhanh các lệnh sau để cài tool nền (git + docker + compose):

```bash
# 1) Tool cơ bản
sudo dnf update -y
sudo dnf install -y git curl unzip ca-certificates
git --version

# 2) Docker
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
newgrp docker
docker --version

# 3) Docker Compose plugin (docker compose ...)
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p "$DOCKER_CONFIG/cli-plugins"
curl -SL "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-linux-x86_64" \
  -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
docker compose version
```

---

## 0) Chuẩn bị trên AWS (làm trên Console)

### 0.1 Security Group
Mở các inbound rules:

- **SSH**: TCP 22 (source = IP của bạn, không nên mở 0.0.0.0/0)
- **HTTP**: TCP 80 (0.0.0.0/0)
- **HTTPS**: TCP 443 (0.0.0.0/0) (nếu dùng SSL)

### 0.2 Elastic IP / Domain (khuyến nghị)
- Nếu có domain: trỏ A record về **Public IP** của EC2.

---

## 1) SSH vào EC2 từ Windows (đã có file key)

### 1.1 Nếu bạn dùng PowerShell
```powershell
ssh -i "C:\path\to\your-key.pem" ec2-user@<EC2_PUBLIC_IP>
```

### 1.2 Nếu bạn dùng Git Bash (Windows)
```bash
ssh -i "/c/path/to/your-key.pem" ec2-user@<EC2_PUBLIC_IP>
```

> Nếu bị lỗi permission key (Windows hay gặp), thử:
```powershell
icacls "C:\path\to\your-key.pem" /inheritance:r
icacls "C:\path\to\your-key.pem" /grant:r "$env:USERNAME:(R)"
```

---

## 2) Cập nhật hệ thống + cài tool cơ bản

> Amazon Linux thường không dùng UFW; bạn quản lý mở port bằng **Security Group** (22/80/443).

### 2.1 Amazon Linux 2 (yum)
```bash
sudo yum update -y
sudo yum install -y git curl unzip ca-certificates
```

### 2.2 Amazon Linux 2023 (dnf)
```bash
sudo dnf update -y
sudo dnf install -y git curl unzip ca-certificates
```

> Nếu bạn gặp lỗi `bash: git: command not found` thì bạn đang chưa chạy bước này hoặc cài thiếu `git`.

---

## 3) Cài Docker + Docker Compose plugin

### 3.1 Amazon Linux 2
```bash
sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker

sudo usermod -aG docker ec2-user
newgrp docker
docker --version
docker compose version || true
```

Nếu `docker compose version` chưa có, cài plugin (áp dụng cho cả AL2/AL2023, tự nhận arch x86_64/aarch64):

```bash
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p "$DOCKER_CONFIG/cli-plugins"
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ]; then BIN="docker-compose-linux-x86_64"; \
elif [ "$ARCH" = "aarch64" ]; then BIN="docker-compose-linux-aarch64"; \
else echo "Unsupported arch: $ARCH" && exit 1; fi

curl -SL "https://github.com/docker/compose/releases/download/v2.24.6/${BIN}" \
  -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
docker compose version
```

### 3.2 Amazon Linux 2023

```bash
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker

sudo usermod -aG docker ec2-user
newgrp docker
docker --version
docker compose version || true
```

---

## 4) Clone source code lên server

Chọn thư mục cài đặt, ví dụ `/opt`:

```bash
cd /opt
sudo mkdir -p hustbus && sudo chown -R ec2-user:ec2-user hustbus
cd hustbus
git clone https://github.com/Chien0903/HustBus.git .
```

> Nếu repo private: dùng deploy key hoặc `git clone` qua HTTPS + PAT.

Nếu vẫn báo `git: command not found`, chạy:

```bash
sudo yum install -y git || sudo dnf install -y git
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
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs || sudo dnf install -y nodejs
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
sudo yum install -y postgresql || sudo dnf install -y postgresql
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
pm2 start server.js --name hustbus-backend
pm2 save
pm2 status
```

Tạo startup service:
```bash
pm2 startup systemd -u ec2-user --hp /home/ec2-user
```
Copy lệnh PM2 in ra và chạy với `sudo` theo hướng dẫn.

Kiểm tra:
```bash
curl http://127.0.0.1:4000/health
```

---

## 9) Build Frontend và serve bằng Nginx

### 9.1 Tạo env cho Frontend
Tạo file: `/opt/hustbus/HustBus_FrontEnd/.env.production`

```env
VITE_API_URL=https://<DOMAIN_OR_EC2_PUBLIC_IP>
```

> Nếu bạn chạy HTTP (chưa SSL): dùng `http://...`

### 9.2 Build
```bash
cd /opt/hustbus/HustBus_FrontEnd
pnpm install
pnpm build
```

Sau build, thư mục output là `dist/`.

### 9.3 Cài Nginx + cấu hình reverse proxy

#### Amazon Linux 2
```bash
sudo amazon-linux-extras install -y nginx1
sudo systemctl enable nginx
sudo systemctl start nginx
```

#### Amazon Linux 2023
```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Tạo config: `/etc/nginx/conf.d/hustbus.conf`

```nginx
server {
    listen 80;
    server_name <DOMAIN_OR_EC2_PUBLIC_IP>;

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

Enable site:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

> LƯU Ý QUAN TRỌNG:
> - Trước khi chạy Certbot, bạn phải thay `server_name` thành đúng domain bạn muốn cấp SSL.
>   Ví dụ: `server_name hustbus.app www.hustbus.app;`
> - Nếu bạn để `server_name` là IP/placeholder thì Certbot có thể cấp cert xong nhưng không tự install vào đúng server block.

---

## 10) (Tuỳ chọn) Bật HTTPS bằng Let’s Encrypt

Chỉ làm nếu bạn có domain trỏ về EC2.

```bash
# Amazon Linux 2 (AL2)
# - AL2 mới có amazon-linux-extras
# sudo amazon-linux-extras install -y epel || true
# sudo yum install -y certbot python3-certbot-nginx
#
# Amazon Linux 2023 (AL2023)
sudo dnf install -y certbot python3-certbot-nginx || true

# Nếu AL2023 báo "No match for argument" (không tìm thấy package), dùng pip (fallback):
if ! command -v certbot >/dev/null 2>&1; then
  sudo dnf install -y python3-pip
  sudo pip3 install -U certbot certbot-nginx
fi

# Cấp SSL (thêm -d www.<domain> nếu bạn dùng www)
#
# LƯU Ý:
# - Tham số -d chỉ nhận "tên miền", KHÔNG có https:// và KHÔNG có dấu /
# - Let's Encrypt dùng HTTP-01 => EC2 phải truy cập được từ Internet qua port 80
# - Domain phải có bản ghi DNS A (hoặc AAAA) trỏ về đúng Public IP/Elastic IP của EC2
#   (Lưu ý: cần record cho cả domain gốc `@` = hustbus.app và subdomain `www` nếu bạn xin cert cho cả 2)
# - Nếu Certbot báo:
#   "Timeout during connect (likely firewall problem)"
#   thì gần như chắc chắn là do một trong các nguyên nhân sau:
#   - Security Group chưa mở inbound TCP 80 (0.0.0.0/0) cho instance
#   - Network ACL chặn port 80/443
#   - Instance nằm trong private subnet (không có Internet Gateway/route ra Internet)
#   - Firewall OS (firewalld) chặn port 80 (ít gặp hơn, nhưng có thể)
#   Checklist kiểm tra nhanh:
#   - AWS Console: SG inbound có HTTP 80 và HTTPS 443
#   - Trên EC2: `sudo ss -lntp | egrep ':80|:443'` (nginx phải LISTEN :80)
#   - Từ máy tính cá nhân: `curl -I http://hustbus.app` phải trả về HTTP response (không timeout)
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
- Mở trình duyệt: `http://<DOMAIN_OR_EC2_PUBLIC_IP>`

---

## 11.5) Pull code mới về EC2 & redeploy (khi bạn cập nhật code trên GitHub)

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

> Khuyến nghị: hạn chế sửa code trực tiếp trên EC2; nên sửa trên máy local rồi push lên GitHub.

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
