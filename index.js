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
        const requestCollection = db.collection("requests");
        const assignedAssetCollection = db.collection("assignedAssets");
        const affiliationCollection = db.collection("employeeAffiliations");

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
                companyName: hr.companyName,
                companyLogo: hr.companyLogo
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

        // Delete Asset
        app.delete("/assets/:id", async (req, res) => {
            const id = req.params.id;
            const result = await assetCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });



        // API For HR Request Page
        // All Requests API
        app.get("/requests/hr", async (req, res) => {
            const { hrEmail } = req.query;

            const result = await requestCollection
                .find({ hrEmail })
                .sort({ requestDate: -1 })
                .toArray();

            res.send(result);
        });


        // Approve Request API
        app.patch("/requests/approve/:id", async (req, res) => {
            const id = req.params.id;

            // Find Request
            const requestQuery = { _id: new ObjectId(id) };
            const requestResult = await requestCollection.findOne(requestQuery);

            if (!requestResult || requestResult.requestStatus !== "pending") {
                return res.send({ success: false, message: "Invalid request" });
            }

            // Asset check
            const assetQuery = { _id: new ObjectId(requestResult.assetId) };
            const assetResult = await assetCollection.findOne(assetQuery);

            if (!assetResult || assetResult.availableQuantity < 1) {
                return res.send({ success: false, message: "Asset not available" });
            }

            // Asset Quantity Reduce
            const assetUpdateDoc = { $inc: { availableQuantity: -1 } };
            const assetUpdateResult = await assetCollection.updateOne(assetQuery, assetUpdateDoc);


            // Employee Assign
            const assignedAssetData = {
                assetId: assetResult._id,
                assetName: assetResult.productName,
                assetType: assetResult.productType,
                assetImage: assetResult.productImage,

                employeeName: requestResult.requesterName,
                employeeEmail: requestResult.requesterEmail,

                hrEmail: requestResult.hrEmail,
                companyName: requestResult.companyName,
                companyLogo: assetResult.companyLogo || requestResult.companyLogo,

                assignmentDate: new Date(),
                returnDate: null, 
                status: "assigned"
            };

            const assignedAssetResult = await assignedAssetCollection.insertOne(assignedAssetData);

            // Employee Affiliation Check
            const affiliationQuery = {
                employeeEmail: requestResult.requesterEmail,
                hrEmail: requestResult.hrEmail
            };
            const existingAffiliation = await affiliationCollection.findOne(affiliationQuery);

            // Create Employee Affiliation
            let newAffiliationResult = null;
            let hrUpdateResult = null;

            if (!existingAffiliation) {

                const queryEmail = { email: requestResult.hrEmail }
                const hrResult = await userCollection.findOne(queryEmail);

                const newAffiliationData = {
                    employeeEmail: requestResult.requesterEmail,
                    employeeName: requestResult.requesterName,
                    hrEmail: requestResult.hrEmail,
                    companyName: hrResult.companyName,
                    companyLogo: hrResult.companyLogo,

                    affiliationDate: new Date(),
                    status: "active"
                };
                newAffiliationResult = await affiliationCollection.insertOne(newAffiliationData);


                const hrquery = { email: requestResult.hrEmail };
                const hrUpdateDoc = { $inc: { currentEmployees: 1 } };

                hrUpdateResult = await userCollection.updateOne(hrquery, hrUpdateDoc);
            }

            // Request Approve
            const requestUpdateDoc = {
                $set: {
                    requestStatus: "approved",
                    approvalDate: new Date()
                }
            };
            const requestUpdateResult = await requestCollection.updateOne(requestQuery, requestUpdateDoc);

            res.send({
                success: true,
                message: "Request approved successfully",
                assetUpdateResult,
                assignedAssetResult,
                affiliationResult: newAffiliationResult,
                hrUpdateResult,
                requestUpdateResult
            });
        });


        // Reject Request API
        app.patch("/requests/reject/:id", async (req, res) => {
            const id = req.params.id;

            // Find Request
            const requestQuery = { _id: new ObjectId(id) };
            const requestResult = await requestCollection.findOne(requestQuery);

            if (!requestResult || requestResult.requestStatus !== "pending") {
                return res.send({ success: false, message: "Invalid request" });
            }

            // Request Reject
            const requestUpdateDoc = {
                $set: {
                    requestStatus: "rejected",
                    rejectionDate: new Date()
                }
            };
            const requestUpdateResult = await requestCollection.updateOne(requestQuery, requestUpdateDoc);

            res.send({
                success: true,
                message: "Request rejected successfully",
                requestUpdateResult
            });
        });






        // Employee Related APIs

        // Available Asset 
        app.get("/employee/assets", async (req, res) => {
            const query = {
                availableQuantity: { $gt: 0 }
            }
            const result = await assetCollection.find(query).toArray();
            res.send(result);
        });


        // Request An Asset
        app.post("/requests", async (req, res) => {
            const data = req.body;
            const assetId = data.assetId;

            if (!assetId) {
                return res.status(400).send({ success: false, message: "Asset ID is required" });
            }

            const query = { _id: new ObjectId(assetId) }
            const asset = await assetCollection.findOne(query);

            if (!asset || asset.availableQuantity <= 0) {
                return res.send({ success: false, message: "Asset not available" });
            }

            // Check Duplicate Request
            const existingRequest = await requestCollection.findOne({
                assetId: asset._id,
                requesterEmail: data.requesterEmail,
                requestStatus: "pending"
            });

            if (existingRequest) {
                return res.send({ success: false, message: "You already have a pending request for this asset." });
            }

            const updateDoc = {
                assetId: asset._id,
                assetName: asset.productName,
                assetType: asset.productType,
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                hrEmail: asset.hrEmail,
                companyName: asset.companyName,
                companyLogo: asset.companyLogo,

                requestDate: new Date(),
                approvalDate: null,
                requestStatus: "pending",

                note: data.note || "",
                processedBy: null
            };

            const result = await requestCollection.insertOne(updateDoc);

            res.send({ success: true, result });
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