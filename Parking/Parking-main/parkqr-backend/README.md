# ParkQR — Backend Setup Guide

## Folder Structure
```
parkqr-backend/
├── server.js              ← Main Express server (run this)
├── db.js                  ← JSON file database (no setup needed)
├── package.json
├── middleware/
│   └── auth.js            ← JWT auth middleware
├── routes/
│   ├── auth.js            ← Login, Register, Check-username
│   ├── parking.js         ← Slots, Ticket, Verify QR, Checkout
│   └── admin.js           ← Stats, Users, Logs, History, Revenue
├── data/                  ← Auto-created on first run (all data stored here)
│   ├── users.json
│   ├── slots.json         ← S50–S60 slots
│   ├── sessions.json
│   ├── logs.json
│   ├── history.json
│   └── revenue.json
└── public/
    └── index.html         ← Your park.html (frontend)
```

---

## How to Run

### 1. Install dependencies
```bash
cd parkqr-backend
npm install
```

### 2. Start the server
```bash
node server.js
```
Or for auto-reload during development:
```bash
npm run dev
```

### 3. Open in browser
```
http://localhost:5000
```

That's it! No database setup, no configuration needed.

---

## Default Admin Login
| Field    | Value       |
|----------|-------------|
| Username | `admin`     |
| Password | `admin123`  |
| Role     | Admin       |

---

## API Endpoints

### Auth
| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | `/api/auth/login`               | Login (user or admin)    |
| POST   | `/api/auth/register`            | Register new user        |
| GET    | `/api/auth/check-username?u=`   | Check username available |

### Parking
| Method | Endpoint                   | Auth   | Description           |
|--------|----------------------------|--------|-----------------------|
| GET    | `/api/parking/slots`       | ✅ Any  | Get all slots         |
| GET    | `/api/parking/slots/available` | ✅ Any | Get free slots only |
| POST   | `/api/parking/ticket`      | ✅ Any  | Generate ticket/check-in |
| POST   | `/api/parking/verify`      | 🛡 Admin | Scan/verify QR code  |
| POST   | `/api/parking/checkout`    | 🛡 Admin | Check out vehicle    |

### Admin
| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| GET    | `/api/admin/stats`              | Live stats dashboard     |
| GET    | `/api/admin/users`              | All registered users     |
| GET    | `/api/admin/logs`               | Activity logs            |
| DELETE | `/api/admin/logs`               | Clear logs               |
| GET    | `/api/admin/history?filter=`    | Booking history          |
| DELETE | `/api/admin/history`            | Clear booking history    |
| GET    | `/api/admin/revenue`            | Revenue breakdown        |
| GET    | `/api/admin/sessions`           | Active sessions          |

---

## Data Storage
All data is saved as JSON files in the `/data/` folder.
- **No MongoDB, MySQL, or any external database required**
- Data persists between server restarts automatically
- Safe for small–medium deployments (up to ~10,000 bookings)

## Slots
Slots are initialized as **S50 to S60** (11 slots) on first run.
To reset slots: delete `data/slots.json` and restart the server.
