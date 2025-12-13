const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');



// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@sajib43.hq7hrle.mongodb.net/?appName=Sajib43`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('asset_verse_db');
        const userCollection = db.collection('users')
        const assetCollection = db.collection('assets')

        // Create Employee Account
        app.post("/register/employee", async (req, res) => {
            const data = req.body;

            const emailExists = await userCollection.findOne({ email: data.email });
            if (emailExists) {
                return res.send({ success: false, message: "Email already exists" });
            }

            const employeeUser = {
                name: data.name,
                email: data.email,
                photoURL: data.photoURL,
                dateOfBirth: data.dateOfBirth,

                role: "employee",
                status: "unaffiliated",
                createdAt: new Date()
            };

            const result = await userCollection.insertOne(employeeUser);

            res.send({ success: true, user: result });
        });


        // Create HR Account
        app.post("/register/hr", async (req, res) => {
            const data = req.body;

            const emailExists = await userCollection.findOne({ email: data.email });
            if (emailExists) {
                return res.send({ success: false, message: "Email already exists" });
            }

            const hrUser = {
                name: data.name,
                email: data.email,
                photoURL: data.photoURL,
                companyName: data.companyName,
                companyLogo: data.companyLogo,
                dateOfBirth: data.dateOfBirth,

                role: "hr",
                packageLimit: 5,
                currentEmployees: 0,
                subscription: "basic",
                createdAt: new Date()
            };

            const result = await userCollection.insertOne(hrUser);

            res.send({ success: true, user: result });
        });


        // ROLE API
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollection.findOne(query)
            res.send({ role: user?.role || 'user' })
        })

        // HR Related APIs

        // Add Asset
        app.post("/assets/add", async (req, res) => {
            const data = req.body;

            // Validate HR
            const hr = await userCollection.findOne({ email: data.hrEmail, role: "hr" });
            if (!hr) {
                return res.send({ success: false, message: "Only HR can add assets!" });
            }

            const newAsset = {
                productName: data.productName,
                productImage: data.productImage,
                productType: data.productType,
                productQuantity: Number(data.productQuantity),
                availableQuantity: Number(data.productQuantity),

                createdAt: new Date(),
                hrEmail: hr.email,
                companyName: hr.companyName
            };

            const result = await assetCollection.insertOne(newAsset);

            res.send({ success: true, asset: result });
        });


        // AssetList API
        app.get("/assets", async (req, res) => {
            const { email, search } = req.query;

            let query = {};
            if (email) query.hrEmail = email;

            if (search) {
                query.productName = { $regex: search, $options: "i" };
            }

            const result = await assetCollection
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });


        // Update/Edit Asset
        app.patch("/assets/:id", async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const query = { _id: new ObjectId(id) };

            const asset = await assetCollection.findOne(query);
            if (!asset) {
                return res.send({ success: false, message: "Asset not found" });
            }


            const newQuantity = Number(data.productQuantity);
            const totalQuantity = newQuantity - asset.productQuantity;

            if (asset.availableQuantity + totalQuantity < 0) {
                return res.send({ success: false, message: "Invalid quantity update. Assets already assigned." });
            }


            const updateDoc = {
                $set: {
                    productName: data.productName,
                    productType: data.productType,
                    productQuantity: newQuantity,
                    availableQuantity: asset.availableQuantity + totalQuantity,
                    productImage: data.productImage || asset.productImage
                }
            };

            const result = await assetCollection.updateOne(query, updateDoc);
            res.send(result);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('AssetVerse server is running')
})

app.listen(port, () => {
    console.log(`AssetVerse server is running on port ${port}`)
})