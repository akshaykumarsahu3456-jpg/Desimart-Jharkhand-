const express = require("express");
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
app.get("/api/products",(req,res)=>res.json(db.products));

app.post("/api/users",(req,res)=>{
  const {name,mobile,role="customer"}=req.body;
  if(!name || !mobile) return res.status(400).json({error:"name and mobile are required"});
  const user={id:db.users.length+1,name,mobile,role};
  db.users.push(user); res.status(201).json(user);
});

app.post("/api/sellers",(req,res)=>{
  const {ownerName,shopName,mobile,city}=req.body;
  if(!ownerName || !shopName || !mobile) return res.status(400).json({error:"ownerName, shopName and mobile are required"});
  const seller={id:db.sellers.length+1,ownerName,shopName,mobile,city,status:"pending"};
  db.sellers.push(seller); res.status(201).json(seller);
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
