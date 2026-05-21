# 🌌 Sirius - Shopify Embedded AI Assistant & Sales Analyst

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-React-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-API-lightgrey?style=for-the-badge&logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue?style=for-the-badge&logo=docker)](https://www.docker.com/)
[![Shopify](https://img.shields.io/badge/Shopify-App-green?style=for-the-badge&logo=shopify)](https://shopify.dev/)

**Desteklenen Yapay Zeka Modelleri**
  
![Anthropic Claude](https://img.shields.io/badge/Claude-3.5_Sonnet_/_Opus-orange?style=flat-square&logo=anthropic)
![OpenAI GPT](https://img.shields.io/badge/GPT-4o_/_5-red?style=flat-square&logo=openai)
![Google Gemini](https://img.shields.io/badge/Gemini-2.0_Pro-blue?style=flat-square&logo=google)

</div>

---

Sirius, Shopify mağazaları için özel olarak geliştirilmiş, mağaza verilerini analiz eden, anomalileri tespit eden ve yapay zeka destekli operasyonel yönetim sağlayan **gömülü (embedded) bir Shopify SaaS uygulamasıdır**. 

Tüccarların kendi API anahtarlarını (Claude, GPT, Gemini) kullanarak en gelişmiş yapay zeka modelleriyle doğrudan mağaza verileri üzerinde konuşmasını sağlar.

---

## 🚀 Öne Çıkan Özellikler

### 🧠 1. Çoklu Model ve API Yönetimi (Multi-Model Orchestrator)
Sirius, tek bir yapay zeka sağlayıcısına bağımlı değildir. Gelişmiş API yönetim paneli ile aşağıdaki modelleri destekler:
*   **Anthropic Claude:** Claude 3.5 Sonnet, Claude 3.5 Opus
*   **OpenAI GPT:** GPT-4o, GPT-5 (o1/o3/o5 serisi altyapısı)
*   **Google Gemini:** Gemini 1.5 Pro, Gemini 2.0 Pro
*   **Güvenli Depolama:** Sağlayıcı API anahtarları veritabanında AES-256-GCM algoritması ile şifrelenerek (`shop_ai_credentials`) güvenli bir şekilde saklanır.

### 🌐 2. Bağlamsal Yönlendirme (Context-Aware Routing)
Gelişmiş niyet analizi (NLP) algoritmaları sayesinde kullanıcının sorgusu gerçek zamanlı olarak sınıflandırılır:
*   **Mağaza Özel (`store_specific`):** Kullanıcı ciro, stok veya sipariş sorduğunda otomatik olarak Shopify veri önbelleği yüklenir.
*   **Genel Ticaret (`commerce_general`) / Pazar Analizi (`market_general`):** Mağaza verisi yüklenmeden genel e-ticaret kuralları çerçevesinde yanıt verilir.
*   **Takip Soruları (`followup`):** Sohbet geçmişindeki son aktif odak korunarak bağlam kaybı önlenir.

### ⚡ 3. Prompt Önbellekleme ve Token Optimizasyonu (Prompt Caching)
API maliyetlerini minimuma indirmek ve yanıt sürelerini hızlandırmak için özel optimizasyon teknikleri kullanılır:
*   **Statik & Dinamik Ayrımı:** `PROMPT_CACHE_BOUNDARY` yardımıyla sistem promptları statik (kimlik, kurallar, yetenekler) ve dinamik (mağaza verileri, güncel mesajlar) olarak ikiye bölünür. Bu sayede Anthropic Ephemeral Cache ve OpenAI Cache özellikleri tetiklenerek **%80'e varan maliyet tasarrufu** sağlanır.
*   **Akıllı Bağlam Budama (Context Pruning):** Kullanıcı odağına göre (Stok, Satış, RCA, vb.) sadece ilgili önbellek verileri serileştirilir. Gereksiz veya büyük veri setleri elenerek token limitleri aşılmaz.

### 🧩 4. Modüler Yapay Zeka Yetenekleri (Sirius Skill Pack)
Yapay zeka asistanı, statik bir prompt yerine `.skill` uzantılı modüllerle çalışır:
*   `anomali.skill`: Mağaza verilerindeki beklenmeyen satış düşüşlerini, stok risklerini ve fırsat sinyallerini tespit eder.
*   `satis-raporu.skill`: Ciro, AOV, sipariş sayısı ve dönem karşılaştırmalarını analiz eder.
*   `rca-aksiyon.skill`: Hataların kök nedenlerini (Root Cause Analysis) analiz eder, hipotezler üretir.
*   `gorev.skill`: AI analizlerinden doğrudan eyleme dökülebilir görev listeleri oluşturur.
*   `sirius-ton.skill`: Asistanın sakin, kararlı ve premium bir danışman tonunda konuşmasını sağlar.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

### Frontend (Kullanıcı Arayüzü)
*   **Framework:** Next.js (React) - Pages Router
*   **Dil:** TypeScript
*   **Styling:** TailwindCSS
*   **Entegrasyon:** Shopify App Bridge v3 / Embedded App SDK

### Backend (Sunucu)
*   **Runtime:** Node.js (>= 20.10.0)
*   **Framework:** Express.js
*   **Veritabanı:** PostgreSQL 15 (Postgres-client `pg` ile native bağlantı)
*   **Dosya İşleme:** Multer, CSV-Parser, PDF-Parse, Mammoth (Word), ADM-Zip

### Altyapı & Dağıtım
*   **Konteynerleştirme:** Docker & Docker Compose
*   **Ters Proxy (Reverse Proxy):** Nginx (HTTP/HTTPS, SSL SSL Let's Encrypt desteği)
*   **Geliştirme Tüneli:** Shopify CLI Dev Tunnel (Cloudflare/Ngrok)

---

## 🗄️ Veritabanı Şeması (Database Schema)

Veritabanı PostgreSQL 15+ üzerinde yapılandırılmıştır. Temel tablolar ve görevleri şunlardır:

| Tablo Adı | Açıklama |
| :--- | :--- |
| `shops` | Kayıtlı Shopify mağazaları, yüklenen planlar, seçili AI modeli ve fatura durumları. |
| `shop_ai_credentials` | AES-256 ile şifrelenmiş tüccar API anahtarları. |
| `skill_assignments` | Mağazalara özel atanmış veya özelleştirilmiş aktif skill şablonları. |
| `shop_data_cache` | Shopify API çağrılarını azaltmak için ciro, sipariş ve ürün verilerinin normalize edilmiş JSON önbelleği. |
| `conversations` | Sohbet geçmişleri, tüketilen token miktarları ve kullanılan skill etiketleri. |
| `conversation_attachments`| Sohbete yüklenen ek dosyalar (PDF, CSV, Image, ZIP vb.) ve bunlardan çıkarılan metinler. |
| `tasks` | Yapay zekanın konuşma sırasında merchant için ürettiği yapılacaklar listesi (Status, priority, confidence). |
| `token_usage` | Detaylı token tüketim analitiği (Girdi, çıktı, önbellek kullanım oranları). |

---

## ⚙️ Kurulum ve Yerel Geliştirme (Local Development)

### 1. Ön Gereksinimler
*   Docker & Docker Desktop yüklü olmalıdır.
*   Shopify Partner Hesabı ve bir Geliştirici Mağazası (Development Store) olmalıdır.

### 2. Çevresel Değişkenler (`.env`)
Proje kök dizininde bir `.env` dosyası oluşturun ve aşağıdaki değişkenleri tanımlayın:

```env
# Shopify App Bilgileri
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_HANDLE=your-app-handle

# Güvenlik ve JWT
JWT_SECRET=super_secret_jwt_key
ENCRYPTION_KEY=32_character_encryption_key_here_!!!

# URL Yapılandırması (Geliştirme aşamasında ngrok/cloudflare tunnel URL'si girilmelidir)
APP_URL=https://your-dev-tunnel.trycloudflare.com

# Veritabanı Parolası
DB_PASSWORD=sirius_secure_postgres_pass

# Geliştirme Ayarları
NODE_ENV=development
AI_DEVELOPMENT_FALLBACK=true
SHOPIFY_BILLING_TEST_MODE=true
```

### 3. Uygulamayı Kapsayıcıda Başlatma
Kök dizinde Docker Compose komutunu çalıştırarak tüm servisleri (Postgres, Node Backend, Next.js Frontend, Nginx Proxy) başlatın:

```bash
docker compose up -d --build
```

Bu komut:
*   `localhost:5432` üzerinde **PostgreSQL** veritabanını ayağa kaldırır ve otomatik olarak `backend/src/db/schema.sql` dosyasını çalıştırarak tabloları oluşturur.
*   `localhost:3001` üzerinde Express **Backend** servisini başlatır.
*   `localhost:3000` üzerinde Next.js **Frontend** uygulamasını başlatır.
*   `localhost:80` üzerinde trafiği yönlendiren **Nginx Proxy** sunucusunu ayağa kaldırır.

### 4. Shopify CLI ile Bağlantı
Shopify CLI kullanarak uygulamanızı geliştirme mağazanıza yükleyin:

```bash
shopify app dev --config dev
```

---

## 📁 Proje Klasör Yapısı (Folder Structure)

```text
sirius/
├── backend/                  # Express API Sunucusu
│   ├── scripts/              # Üretim ortamı test ve doğrulama betikleri
│   ├── skills/               # .skill formatındaki AI yönlendirme şablonları
│   ├── src/
│   │   ├── db/               # Veritabanı bağlantısı ve schema.sql
│   │   ├── middleware/       # Kimlik doğrulama ve Shopify session kontrolleri
│   │   ├── routes/           # Chat, Auth, Billing ve Webhook uç noktaları
│   │   └── services/         # AI Yönlendirici, Prompt Optimizasyonu, Kripto işlemleri
│   ├── Dockerfile
│   └── package.json
├── frontend/                 # Next.js Uygulaması (Pages Router)
│   ├── components/           # UI Bileşenleri (Chat, Sidebar, Metric Cards vb.)
│   ├── pages/                # Next.js sayfaları (Dashboard, Setup, Install vb.)
│   ├── store/                # Zustand/Redux Durum Yönetimi
│   ├── styles/               # Global stiller ve Tailwind CSS
│   ├── Dockerfile
│   └── package.json
├── docs/                     # Geliştirme dökümanları
├── docker-compose.yml        # Yerel Docker orchestration dosyası
├── nginx.conf                # Nginx yerel proxy yapılandırması
├── nginx.prod.example.conf   # Production SSL proxy örnek dosyası
├── shopify.app.toml          # Üretim ortamı Shopify yapılandırması
└── shopify.app.dev.toml      # Yerel geliştirme Shopify yapılandırması
```

---

## 🔐 Güvenlik ve GDPR Entegrasyonu
Sirius, Shopify App Store kurallarına tam uyumludur:
1.  **Müşteri Verisi Gizliliği:** Çekilen sipariş verilerinde müşteri kimlikleri, adresler ve kişisel veriler (`customerId`, `customer`, `billing_address`) model API'sine gönderilmeden önce backend katmanında temizlenir (`anonymizeOrders`).
2.  **GDPR Webhook Desteği:** `backend/src/routes/webhooks.js` dosyası altında `customers/data_request`, `customers/redact` ve `shop/redact` webhook talepleri standartlara uygun şekilde işlenir.

---

## 🛡️ Canlı Ortama Dağıtım (Production Deployment)

Uygulamayı canlı sunucuya (VPS) taşırken şu adımları izleyin:

1.  **Nginx HTTPS Geçişi:** `nginx.prod.example.conf` dosyasını `nginx.conf` olarak kopyalayın, SSL sertifika yollarını düzenleyin ve port 443'ü aktif edin.
2.  **Üretim Modu:** `.env` dosyasında `NODE_ENV=production` ve `AI_DEVELOPMENT_FALLBACK=false` olarak güncelleyin.
3.  **Doğrulama Betikleri:** Canlı sunucuda veritabanı bütünlüğünü ve çoklu kiracılık (multi-tenant) güvenliğini test etmek için backend dizininde doğrulama betiklerini çalıştırın:
    ```bash
    npm run verify:production
    npm run verify:multitenant
    ```

---
*Developed with ❤️ for Shopify Merchants.*
