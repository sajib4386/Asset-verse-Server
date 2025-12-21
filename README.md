# AssetVerse

## Project Name
AssetVerse

## Purpose
The AssetVerse server application handles all backend logic including authentication, authorization, asset management, employee affiliation, package management, payments, and analytics APIs.

---

## Live Server
Server URL: https://asset-verse-server-ashen.vercel.app

---

## Key Features
- JWT authentication system
- Role-based authorization (HR & Employee)
- Secure RESTful APIs
- Asset CRUD operations
- Asset request and approval workflow
- Auto employee affiliation system
- Package limit enforcement
- Stripe payment integration
- Payment history tracking
- Server-side pagination
- Analytics data APIs

---

## npm Packages Used
- Node.js
- Express.js
- MongoDB (Native Driver)
- JSON Web Token (JWT)
- Stripe
- dotenv
- CORS  

---  

## Setup Instructions

1. Clone the server repository  
   git clone https://github.com/your-username/asset-verse-server.git

2. Navigate to the project directory  
   cd asset-verse-server

3. Install all dependencies  
   npm install

4. Start the server  
   npm start

5. Server will run on  
   http://localhost:3000  


---  

## Environment Variables Configuration

Create a `.env` file in the root directory of the server project and add the following variables:

DB_USER=your_mongodb_username  
DB_PASS=your_mongodb_password  
JWT_SECRET=your_jwt_secret_key  
STRIPE_SECRET=your_stripe_secret_key  
SITE_DOMAIN=http://localhost:5173

