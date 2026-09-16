# Study Grid VPS Deployment

This deployment uses an Ubuntu VPS, Nginx, systemd, and MongoDB Atlas.

## 1. Prepare the server

Install Node.js 20+, Nginx, Git, and Certbot:

```bash
sudo apt update
sudo apt install -y nginx git curl certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Create the application directory and a service user:

```bash
sudo mkdir -p /var/www/study-grid
sudo useradd --system --home /var/www/study-grid --shell /usr/sbin/nologin studygrid
sudo chown -R "$USER":"$USER" /var/www/study-grid
```

## 2. Upload the project

From the server, clone the repository:

```bash
cd /var/www
sudo git clone YOUR_REPOSITORY_URL study-grid
sudo chown -R "$USER":"$USER" /var/www/study-grid
```

Install dependencies and build the frontend:

```bash
cd /var/www/study-grid/backend
npm ci --omit=dev

cd /var/www/study-grid/frontend
npm ci
npm run build
```

## 3. Configure production secrets

Create `/var/www/study-grid/backend/.env` and never commit it:

```env
PORT=5000
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/academicradar
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://YOUR_DOMAIN
```

In MongoDB Atlas, add the VPS public IP to Network Access and create a least-privilege database user.

Generate a secret with:

```bash
openssl rand -base64 48
```

## 4. Start the API with systemd

Copy the service file from this repository:

```bash
sudo cp /var/www/study-grid/deployment/study-grid.service /etc/systemd/system/study-grid.service
sudo chown -R studygrid:studygrid /var/www/study-grid
sudo systemctl daemon-reload
sudo systemctl enable --now study-grid
sudo systemctl status study-grid
curl http://127.0.0.1:5000/api/health
```

If Node is installed somewhere other than `/usr/bin/node`, update `ExecStart` in the service file.

## 5. Configure Nginx

Replace `study-grid.example.com` in the provided config with the real domain:

```bash
sudo cp /var/www/study-grid/deployment/study-grid.nginx.conf /etc/nginx/sites-available/study-grid
sudo ln -s /etc/nginx/sites-available/study-grid /etc/nginx/sites-enabled/study-grid
sudo nginx -t
sudo systemctl reload nginx
```

Point the domain's DNS A record to the VPS public IP, then enable HTTPS:

```bash
sudo certbot --nginx -d YOUR_DOMAIN
```

The application will be available at `https://YOUR_DOMAIN` and the API at `https://YOUR_DOMAIN/api`.

## 6. Updating the app

```bash
cd /var/www/study-grid
git pull
cd backend
npm ci --omit=dev
sudo systemctl restart study-grid
cd ../frontend
npm ci
npm run build
sudo systemctl reload nginx
```

## Security checklist

- Use MongoDB Atlas instead of exposing MongoDB on the VPS.
- Keep `backend/.env` out of Git.
- Use a long random `JWT_SECRET`.
- Allow only ports 22, 80, and 443 in the VPS firewall.
- Do not expose port 5000 publicly; Nginx proxies to it locally.
- Back up the MongoDB database before production migrations or cleanup.
