const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* =========================
   TEMP PRODUCT DATA
========================= */

const products = [
  {
    id: 1,
    name: "Nagpuri Handicraft",
    price: 499,
    stock: 20,
    sellerId: 1,
    category: "Handicraft"
  },
  {
    id: 2,
    name: "Traditional Gamcha",
    price: 299,
    stock: 35,
    sellerId: 2,
    category: "Fashion"
  }
];

/* =========================
   TEMP CART & ORDERS
========================= */

const carts = {};
const orders = [];

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        mobile VARCHAR(20) NOT NULL UNIQUE,
        password_hash TEXT,
        role VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sellers (
        id SERIAL PRIMARY KEY,
        owner_name VARCHAR(100) NOT NULL,
        shop_name VARCHAR(150) NOT NULL,
        mobile VARCHAR(20) NOT NULL,
        city VARCHAR(100),
        password_hash TEXT,
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

/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "DesiMart Jharkhand API"
  });
});

/* =========================
   DATABASE TEST
========================= */

app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      ok: true,
      database: "connected",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      ok: false,
      database: "not connected"
    });
  }
});

/* =========================
   PRODUCTS
========================= */

app.get("/api/products", (req, res) => {
  res.json(products);
});

/* =========================
   REGISTER CUSTOMER
========================= */

app.post("/api/users", async (req, res) => {
  try {
    const {
      name,
      mobile,
      password,
      role = "customer"
    } = req.body;

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

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users
      (name, mobile, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, mobile, role, created_at
      `,
      [name, mobile, passwordHash, role]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error("Registration error:", error.message);

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

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const {
      mobile,
      password
    } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({
        error: "mobile and password are required"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        mobile,
        password_hash,
        role
      FROM users
      WHERE mobile = $1
      `,
      [mobile]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid mobile or password"
      });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({
        error: "Password not set for this account"
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid mobile or password"
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      error: "Login failed"
    });
  }
});

/* =========================
   CREATE SELLER
========================= */

app.post("/api/sellers", async (req, res) => {
  try {
    const {
      ownerName,
      shopName,
      mobile,
      city
    } = req.body;

    if (!ownerName || !shopName || !mobile) {
      return res.status(400).json({
        error: "ownerName, shopName and mobile are required"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO sellers
      (owner_name, shop_name, mobile, city)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        owner_name,
        shop_name,
        mobile,
        city,
        status,
        created_at
      `,
      [
        ownerName,
        shopName,
        mobile,
        city || null
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error("Seller error:", error.message);

    res.status(500).json({
      error: "Failed to create seller"
    });
  }
});

/* =========================
   ADD PRODUCT
========================= */

app.post("/api/products", (req, res) => {
  const {
    name,
    price,
    stock,
    sellerId,
    category
  } = req.body;

  if (!name || price == null || !sellerId) {
    return res.status(400).json({
      error: "name, price and sellerId are required"
    });
  }

  const product = {
    id: products.length + 1,
    name,
    price: Number(price),
    stock: Number(stock || 0),
    sellerId: Number(sellerId),
    category: category || "Other"
  };

  products.push(product);

  res.status(201).json(product);
});

/* =========================
   ADD TO CART
========================= */

app.post("/api/cart/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const {
      productId,
      quantity = 1
    } = req.body;

    const product = products.find(
      p => p.id === Number(productId)
    );

    if (!product) {
      return res.status(404).json({
        error: "Product not found"
      });
    }

    if (product.stock <= 0) {
      return res.status(400).json({
        error: "Product out of stock"
      });
    }

    if (!carts[userId]) {
      carts[userId] = [];
    }

    const existing = carts[userId].find(
      item => item.productId === Number(productId)
    );

    if (existing) {
      existing.quantity += Number(quantity);
    } else {
      carts[userId].push({
        productId: Number(productId),
        quantity: Number(quantity)
      });
    }

    res.status(201).json({
      success: true,
      cart: carts[userId]
    });

  } catch (error) {
    console.error("Add cart error:", error.message);

    res.status(500).json({
      error: "Failed to add product to cart"
    });
  }
});

/* =========================
   GET CART
========================= */

app.get("/api/cart/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const userCart = carts[userId] || [];

    const result = userCart.map(item => {
      const product = products.find(
        p => p.id === Number(item.productId)
      );

      if (!product) {
        return null;
      }

      return {
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: Number(item.quantity),
        stock: product.stock,
        category: product.category
      };
    }).filter(Boolean);

    res.json(result);

  } catch (error) {
    console.error("Get cart error:", error.message);

    res.status(500).json({
      error: "Failed to load cart"
    });
  }
});

/* =========================
   REMOVE FROM CART
========================= */

app.delete(
  "/api/cart/:userId/:productId",
  (req, res) => {

    try {
      const userId = Number(req.params.userId);
      const productId = Number(req.params.productId);

      if (!carts[userId]) {
        return res.json([]);
      }

      carts[userId] = carts[userId].filter(
        item => item.productId !== productId
      );

      res.json(carts[userId]);

    } catch (error) {
      console.error(
        "Remove cart error:",
        error.message
      );

      res.status(500).json({
        error: "Failed to remove cart item"
      });
    }
  }
);

/* =========================
   CREATE ORDER
========================= */

app.post("/api/orders", (req, res) => {
  try {
    const {
      userId,
      items,
      address,
      paymentMethod = "COD"
    } = req.body;

    if (
      !userId ||
      !items ||
      !items.length ||
      !address
    ) {
      return res.status(400).json({
        error: "userId, items and address are required"
      });
    }

    let total = 0;

    for (const item of items) {
      const product = products.find(
        p => p.id === Number(item.productId)
      );

      if (!product) {
        return res.status(400).json({
          error:
            `product ${item.productId} not found`
        });
      }

      total +=
        Number(product.price) *
        Number(item.quantity || 1);
    }

    const order = {
      id: orders.length + 1001,
      userId: Number(userId),
      items,
      address,
      paymentMethod,
      total,
      status: "placed",
      createdAt: new Date().toISOString()
    };

    orders.push(order);

    res.status(201).json(order);

  } catch (error) {
    console.error("Order error:", error.message);

    res.status(500).json({
      error: "Failed to create order"
    });
  }
});

/* =========================
   ADMIN SUMMARY
========================= */

app.get("/api/admin/summary", async (req, res) => {
  try {
    const usersResult =
      await pool.query("SELECT COUNT(*) FROM users");

    const sellersResult =
      await pool.query("SELECT COUNT(*) FROM sellers");

    res.json({
      owner: "Akshay Kumar Sahu",
      sellers: Number(sellersResult.rows[0].count),
      customers: Number(usersResult.rows[0].count),
      products: products.length,
      orders: orders.length,
      commissionRate: 0.08
    });

  } catch (error) {
    console.error(
      "Admin summary error:",
      error.message
    );

    res.status(500).json({
      error: "Failed to load admin summary"
    });
  }
});

/* =========================
   START SERVER
========================= */

async function startServer() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(
      `DesiMart API running on port ${PORT}`
    );
  });
}

startServer();
