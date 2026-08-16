const express = require("express");
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function addLoginColumns() {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;

      ALTER TABLE sellers
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);

    console.log("Login columns ready");
  } catch (error) {
    console.error("Login column error:", error.message);
  }
}

addLoginColumns();
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        mobile VARCHAR(20) NOT NULL UNIQUE,
        role VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sellers (
        id SERIAL PRIMARY KEY,
        owner_name VARCHAR(100) NOT NULL,
        shop_name VARCHAR(150) NOT NULL,
        mobile VARCHAR(20) NOT NULL,
        city VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER DEFAULT 0,
        seller_id INTEGER,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        items JSONB NOT NULL,
        address TEXT NOT NULL,
        payment_method VARCHAR(30) DEFAULT 'COD',
        total NUMERIC(10,2) NOT NULL,
        status VARCHAR(30) DEFAULT 'placed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS carts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        UNIQUE(user_id, product_id)
      );
    `);

    console.log("PostgreSQL tables ready");
  } catch (error) {
    console.error("Database initialization error:", error.message);
  }
}

initDatabase();
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const db = {
  users: [],
  sellers: [],
  products: [
    {id:1,name:"Nagpuri Handicraft",price:499,stock:20,sellerId:1,category:"Handicraft"},
    {id:2,name:"Traditional Gamcha",price:299,stock:35,sellerId:2,category:"Fashion"}
  ],
  carts: {},
  orders: []
};

app.get("/api/health",(req,res)=>res.json({ok:true,service:"DesiMart Jharkhand API"}));
app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      ok: true,
      database: "connected",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      ok: false,
      database: "not connected"
    });
  }
});
app.get("/api/products",(req,res)=>res.json(db.products));
app.post("/api/users", async (req, res) => {
  try {
    const { name, mobile, password, role = "customer" } = req.body;

    if (!name || !mobile || !password) {
      return res.status(400).json({
        error: "name, mobile and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "password must be at least 6 characters"
      });
    }

    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, mobile, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, mobile, role, created_at`,
      [name, mobile, passwordHash, role]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error("User registration error:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Mobile number already registered"
      });
    }

    res.status(500).json({
      error: "Failed to register user"
    });
  }
});
  
app.post("/api/sellers", async (req, res) => {
  try {
    const { ownerName, shopName, mobile, city } = req.body;

    if (!ownerName || !shopName || !mobile) {
      return res.status(400).json({
        error: "ownerName, shopName and mobile are required"
      });
    }

    const result = await pool.query(
      `INSERT INTO sellers (owner_name, shop_name, mobile, city)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_name, shop_name, mobile, city, status, created_at`,
      [ownerName, shopName, mobile, city || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error("Seller creation error:", error.message);

    res.status(500).json({
      error: "Failed to create seller"
    });
  }
});



app.post("/api/products",(req,res)=>{
  const {name,price,stock,sellerId,category}=req.body;
  if(!name || price==null || !sellerId) return res.status(400).json({error:"name, price and sellerId are required"});
  const product={id:db.products.length+1,name,price:Number(price),stock:Number(stock||0),sellerId:Number(sellerId),category:category||"Other"};
  db.products.push(product); res.status(201).json(product);
});

app.post("/api/cart/:userId",(req,res)=>{
  const userId=Number(req.params.userId);
  const {productId,quantity=1}=req.body;
  const product=db.products.find(p=>p.id===Number(productId));
  if(!product) return res.status(404).json({error:"product not found"});
  db.carts[userId] ||= [];
  db.carts[userId].push({productId:Number(productId),quantity:Number(quantity)});
  res.status(201).json(db.carts[userId]);
});

app.post("/api/orders",(req,res)=>{
  const {userId,items,address,paymentMethod="COD"}=req.body;
  if(!userId || !items?.length || !address) return res.status(400).json({error:"userId, items and address are required"});
  let total=0;
  for(const item of items){
    const p=db.products.find(x=>x.id===Number(item.productId));
    if(!p) return res.status(400).json({error:`product ${item.productId} not found`});
    total += p.price * Number(item.quantity||1);
  }
  const order={id:db.orders.length+1001,userId:Number(userId),items,address,paymentMethod,total,status:"placed",createdAt:new Date().toISOString()};
  db.orders.push(order); res.status(201).json(order);
});

app.get("/api/admin/summary",(req,res)=>res.json({
  owner:"Akshay Kumar Sahu",
  sellers:db.sellers.length,
  customers:db.users.filter(u=>u.role==="customer").length,
  products:db.products.length,
  orders:db.orders.length,
  commissionRate:0.08
}));

app.listen(PORT,()=>console.log(`DesiMart API running at http://localhost:${PORT}`));
