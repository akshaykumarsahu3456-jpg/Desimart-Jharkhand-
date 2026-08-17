const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initDatabase() {
  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        mobile VARCHAR(20) UNIQUE NOT NULL,
        password_hash TEXT,
        role VARCHAR(20) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sellers (
        id SERIAL PRIMARY KEY,
        owner_name VARCHAR(100) NOT NULL,
        shop_name VARCHAR(150) NOT NULL,
        mobile VARCHAR(20) UNIQUE NOT NULL,
        city VARCHAR(100),
        password_hash TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS carts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        UNIQUE(user_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        payment_method VARCHAR(30) DEFAULT 'COD',
        total NUMERIC(10,2) NOT NULL,
        status VARCHAR(30) DEFAULT 'placed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(200) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL
      );
    `);

    /* Existing database compatibility */

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;

      ALTER TABLE sellers
      ADD COLUMN IF NOT EXISTS password_hash TEXT;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS description TEXT;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS image_url TEXT;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS category_id INTEGER;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS seller_id INTEGER;

      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
    `);

    /* Categories */

    const categories = [
      "फल और सब्ज़ियाँ",
      "चावल, आटा, दाल और अनाज",
      "किराना",
      "मसाले",
      "कपड़े और Gamcha",
      "Jharkhand Handicrafts",
      "Desi और Local Products",
      "घर और Personal Care",
      "जूते और चप्पल",
      "Bags और Accessories"
    ];

    for (const name of categories) {

      await pool.query(
        `
        INSERT INTO categories (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
        `,
        [name]
      );

    }

    console.log("PostgreSQL tables ready");

  } catch (error) {

    console.error(
      "Database initialization error:",
      error.message
    );

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

    const result =
      await pool.query("SELECT NOW()");

    res.json({
      ok: true,
      database: "connected",
      time: result.rows[0].now
    });

  } catch (error) {

    console.error(
      "Database test:",
      error.message
    );

    res.status(500).json({
      ok: false,
      database: "not connected",
      error: error.message
    });

  }

});

/* =========================
   CUSTOMER REGISTER
========================= */

app.post("/api/users", async (req, res) => {

  try {

    const {
      name,
      mobile,
      password
    } = req.body;

    if (!name || !mobile || !password) {

      return res.status(400).json({
        error:
          "नाम, मोबाइल और password जरूरी है"
      });

    }

    if (password.length < 6) {

      return res.status(400).json({
        error:
          "Password कम से कम 6 characters का होना चाहिए"
      });

    }

    const passwordHash =
      await bcrypt.hash(password, 10);

    const result =
      await pool.query(
        `
        INSERT INTO users
        (
          name,
          mobile,
          password_hash,
          role
        )
        VALUES ($1,$2,$3,'customer')
        RETURNING
          id,
          name,
          mobile,
          role
        `,
        [
          name,
          mobile,
          passwordHash
        ]
      );

    res.status(201).json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {

    console.error(
      "Registration:",
      error.message
    );

    if (error.code === "23505") {

      return res.status(409).json({
        error:
          "यह mobile number पहले से registered है"
      });

    }

    res.status(500).json({
      error:
        "Registration failed"
    });

  }

});

/* =========================
   CUSTOMER LOGIN
========================= */

app.post("/api/login", async (req, res) => {

  try {

    const {
      mobile,
      password
    } = req.body;

    if (!mobile || !password) {

      return res.status(400).json({
        error:
          "Mobile और password जरूरी है"
      });

    }

    const result =
      await pool.query(
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

    if (!result.rows.length) {

      return res.status(401).json({
        error:
          "Mobile या password गलत है"
      });

    }

    const user =
      result.rows[0];

    if (!user.password_hash) {

      return res.status(401).json({
        error:
          "इस account का password setup नहीं है। दोबारा register करें।"
      });

    }

    const match =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (!match) {

      return res.status(401).json({
        error:
          "Mobile या password गलत है"
      });

    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        role: user.role
      }
    });

  } catch (error) {

    console.error(
      "Login:",
      error.message
    );

    res.status(500).json({
      error:
        "Login failed"
    });

  }

});

/* =========================
   CATEGORIES
========================= */

app.get("/api/categories", async (req, res) => {

  try {

    const result =
      await pool.query(
        `
        SELECT
          id,
          name
        FROM categories
        ORDER BY id
        `
      );

    res.json(result.rows);

  } catch (error) {

    console.error(
      "Categories:",
      error.message
    );

    res.status(500).json({
      error:
        "Categories load failed"
    });

  }

});

/* =========================
   PRODUCTS
========================= */

app.get("/api/products", async (req, res) => {

  try {

    const {
      category,
      search
    } = req.query;

    let query = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.image_url,
        p.category_id,
        c.name AS category,
        p.seller_id
      FROM products p
      LEFT JOIN categories c
        ON p.category_id = c.id
      WHERE p.status = 'active'
    `;

    const values = [];

    if (category) {

      values.push(Number(category));

      query +=
        ` AND p.category_id = $${values.length}`;

    }

    if (search) {

      values.push(
        `%${search}%`
      );

      query += `
        AND (
          p.name ILIKE $${values.length}
          OR p.description ILIKE $${values.length}
        )
      `;

    }

    query +=
      ` ORDER BY p.created_at DESC`;

    const result =
      await pool.query(
        query,
        values
      );

    res.json(result.rows);

  } catch (error) {

    console.error(
      "Products:",
      error.message
    );

    res.status(500).json({
      error:
        "Products load failed"
    });

  }

});

/* =========================
   SELLER REGISTER
========================= */

app.post("/api/sellers", async (req, res) => {

  try {

    const {
      ownerName,
      shopName,
      mobile,
      city,
      password
    } = req.body;

    if (
      !ownerName ||
      !shopName ||
      !mobile ||
      !password
    ) {

      return res.status(400).json({
        error:
          "Owner name, shop name, mobile और password जरूरी है"
      });

    }

    if (password.length < 6) {

      return res.status(400).json({
        error:
          "Password कम से कम 6 characters का होना चाहिए"
      });

    }

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );

    const result =
      await pool.query(
        `
        INSERT INTO sellers
        (
          owner_name,
          shop_name,
          mobile,
          city,
          password_hash
        )
        VALUES ($1,$2,$3,$4,$5)
        RETURNING
          id,
          owner_name,
          shop_name,
          mobile,
          city,
          status
        `,
        [
          ownerName,
          shopName,
          mobile,
          city || null,
          passwordHash
        ]
      );

    res.status(201).json({
      success: true,
      seller: result.rows[0]
    });

  } catch (error) {

    console.error(
      "Seller registration:",
      error.message
    );

    if (error.code === "23505") {

      return res.status(409).json({
        error:
          "यह seller mobile पहले से registered है"
      });

    }

    res.status(500).json({
      error:
        "Seller registration failed"
    });

  }

});

/* =========================
   SELLER LOGIN
========================= */

app.post("/api/seller-login", async (req, res) => {

  try {

    const {
      mobile,
      password
    } = req.body;

    if (!mobile || !password) {

      return res.status(400).json({
        error:
          "Mobile और password जरूरी है"
      });

    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          owner_name,
          shop_name,
          mobile,
          city,
          password_hash,
          status
        FROM sellers
        WHERE mobile = $1
        `,
        [mobile]
      );

    if (!result.rows.length) {

      return res.status(401).json({
        error:
          "Seller account नहीं मिला"
      });

    }

    const seller =
      result.rows[0];

    if (!seller.password_hash) {

      return res.status(401).json({
        error:
          "Seller password setup नहीं है"
      });

    }

    const match =
      await bcrypt.compare(
        password,
        seller.password_hash
      );

    if (!match) {

      return res.status(401).json({
        error:
          "Mobile या password गलत है"
      });

    }

    res.json({
      success: true,
      seller: {
        id: seller.id,
        ownerName:
          seller.owner_name,
        shopName:
          seller.shop_name,
        mobile:
          seller.mobile,
        city:
          seller.city,
        status:
          seller.status
      }
    });

  } catch (error) {

    console.error(
      "Seller login:",
      error.message
    );

    res.status(500).json({
      error:
        "Seller login failed"
    });

  }

});

/* =========================
   SELLER ADD PRODUCT
========================= */

app.post(
  "/api/seller/products",
  async (req, res) => {

    try {

      const {
        sellerId,
        name,
        description,
        price,
        stock,
        imageUrl,
        categoryId
      } = req.body;

      if (
        !sellerId ||
        !name ||
        price == null ||
        stock == null ||
        !categoryId
      ) {

        return res.status(400).json({
          error:
            "Seller, product name, price, stock और category जरूरी है"
        });

      }

      const sellerCheck =
        await pool.query(
          `
          SELECT
            id,
            status
          FROM sellers
          WHERE id = $1
          `,
          [Number(sellerId)]
        );

      if (!sellerCheck.rows.length) {

        return res.status(404).json({
          error:
            "Seller नहीं मिला"
        });

      }

      const categoryCheck =
        await pool.query(
          `
          SELECT id
          FROM categories
          WHERE id = $1
          `,
          [Number(categoryId)]
        );

      if (!categoryCheck.rows.length) {

        return res.status(400).json({
          error:
            "Category नहीं मिली"
        });

      }

      const result =
        await pool.query(
          `
          INSERT INTO products
          (
            name,
            description,
            price,
            stock,
            image_url,
            category_id,
            seller_id,
            status
          )
          VALUES
          ($1,$2,$3,$4,$5,$6,$7,'active')
          RETURNING *
          `,
          [
            name,
            description || null,
            Number(price),
            Number(stock),
            imageUrl || null,
            Number(categoryId),
            Number(sellerId)
          ]
        );

      res.status(201).json({
        success: true,
        product:
          result.rows[0]
      });

    } catch (error) {

      console.error(
        "Seller product:",
        error.message
      );

      res.status(500).json({
        error:
          "Product add failed"
      });

    }

  }
);

/* =========================
   SELLER PRODUCTS
========================= */

app.get(
  "/api/seller/:sellerId/products",
  async (req, res) => {

    try {

      const sellerId =
        Number(req.params.sellerId);

      const result =
        await pool.query(
          `
          SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.stock,
            p.image_url,
            p.category_id,
            c.name AS category,
            p.status,
            p.created_at
          FROM products p
          LEFT JOIN categories c
            ON p.category_id = c.id
          WHERE p.seller_id = $1
          ORDER BY p.created_at DESC
          `,
          [sellerId]
        );

      res.json(result.rows);

    } catch (error) {

      console.error(
        "Seller products:",
        error.message
      );

      res.status(500).json({
        error:
          "Seller products load failed"
      });

    }

  }
);

/* =========================
   ADD TO CART
========================= */

app.post(
  "/api/cart/:userId",
  async (req, res) => {

    try {

      const userId =
        Number(req.params.userId);

      const productId =
        Number(req.body.productId);

      const quantity =
        Number(
          req.body.quantity || 1
        );

      if (
        !userId ||
        !productId ||
        quantity < 1
      ) {

        return res.status(400).json({
          error:
            "Invalid cart data"
        });

      }

      const productResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            price,
            stock
          FROM products
          WHERE id = $1
          AND status = 'active'
          `,
          [productId]
        );

      if (!productResult.rows.length) {

        return res.status(404).json({
          error:
            "Product नहीं मिला"
        });

      }

      const product =
        productResult.rows[0];

      const existingResult =
        await pool.query(
          `
          SELECT quantity
          FROM carts
          WHERE user_id = $1
          AND product_id = $2
          `,
          [
            userId,
            productId
          ]
        );

      const existingQuantity =
        existingResult.rows.length
          ? Number(
              existingResult.rows[0].quantity
            )
          : 0;

      const newQuantity =
        existingQuantity +
        quantity;

      if (
        newQuantity >
        Number(product.stock)
      ) {

        return res.status(400).json({
          error:
            "इतना stock उपलब्ध नहीं है"
        });

      }

      await pool.query(
        `
        INSERT INTO carts
        (
          user_id,
          product_id,
          quantity
        )
        VALUES ($1,$2,$3)
        ON CONFLICT
        (user_id, product_id)
        DO UPDATE SET
          quantity =
            EXCLUDED.quantity
        `,
        [
          userId,
          productId,
          newQuantity
        ]
      );

      res.json({
        success: true,
        message:
          "Product cart में add हो गया"
      });

    } catch (error) {

      console.error(
        "Add cart:",
        error.message
      );

      res.status(500).json({
        error:
          "Cart में product add नहीं हुआ"
      });

    }

  }
);

/* =========================
   GET CART
========================= */

app.get(
  "/api/cart/:userId",
  async (req, res) => {

    try {

      const userId =
        Number(req.params.userId);

      const result =
        await pool.query(
          `
          SELECT
            c.product_id AS "productId",
            c.quantity,
            p.name,
            p.price,
            p.stock,
            p.image_url AS "imageUrl",
            cat.name AS category
          FROM carts c
          JOIN products p
            ON c.product_id = p.id
          LEFT JOIN categories cat
            ON p.category_id = cat.id
          WHERE c.user_id = $1
          ORDER BY c.id DESC
          `,
          [userId]
        );

      const items =
        result.rows.map(item => {

          const price =
            Number(item.price);

          const quantity =
            Number(item.quantity);

          return {
            ...item,
            price,
            quantity,
            stock:
              Number(item.stock),
            itemTotal:
              price * quantity
          };

        });

      const total =
        items.reduce(
          (sum, item) =>
            sum + item.itemTotal,
          0
        );

      res.json({
        items,
        total
      });

    } catch (error) {

      console.error(
        "Get cart:",
        error.message
      );

      res.status(500).json({
        error:
          "Cart load failed"
      });

    }

  }
);

/* ================
