const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);



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

        const packagesCollection = db.collection("packages");
        const paymentsCollection = db.collection("payments");


        //           CREATE EMPLOYEE ACCOUNT
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


        //            CREATE HR ACCOUNT
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
                subscription: "free",
                createdAt: new Date()
            };

            const result = await userCollection.insertOne(hrUser);

            res.send({ success: true, user: result });
        });


        //            ROLE API
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollection.findOne(query)
            res.send({ role: user?.role || 'user' })
        })



        //             HR RELATED APIS

        //              ADD ASSET
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


        //           ASSETLIST API
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


        //        UPDATE/EDIT ASSET
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

        //         DELETE ASSET
        app.delete("/assets/:id", async (req, res) => {
            const id = req.params.id;
            const result = await assetCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });



        //        ALL REQUEST API
        app.get("/requests/hr", async (req, res) => {
            const { hrEmail } = req.query;

            const result = await requestCollection
                .find({ hrEmail })
                .sort({ requestDate: -1 })
                .toArray();

            res.send(result);
        });



        //          APPROVE REQUEST API
        app.patch("/requests/approve/:id", async (req, res) => {
            const id = req.params.id;

            // Find Request
            const requestQuery = { _id: new ObjectId(id) };
            const requestResult = await requestCollection.findOne(requestQuery);

            if (!requestResult || requestResult.requestStatus !== "pending") {
                return res.send({ success: false, message: "Invalid request" });
            }

            // Employee Count
            const activeEmployeeCount = await affiliationCollection.countDocuments({
                hrEmail: requestResult.hrEmail,
                status: "active"
            });

            // Only need packageLimit from HR
            const hrInfo = await userCollection.findOne(
                { email: requestResult.hrEmail },
                { projection: { packageLimit: 1 } }
            );

            // Package limit check
            if (activeEmployeeCount >= hrInfo.packageLimit) {
                return res.send({
                    success: false,
                    message: "Package limit reached. Please upgrade your package."
                });
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

            const approvalDate = new Date();
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
                requestDate: requestResult.requestDate,
                approvalDate: approvalDate,
                returnDate: null,
                status: "approved"
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

            // Remove Employee Rejoin
            else if (existingAffiliation.status === "inactive") {
                await affiliationCollection.updateOne(
                    { _id: existingAffiliation._id },
                    {
                        $set: {
                            status: "active",
                            rejoinedAt: new Date()
                        }
                    }
                );

                await userCollection.updateOne(
                    { email: requestResult.hrEmail },
                    { $inc: { currentEmployees: 1 } }
                );
            }


            // Request Approve
            const requestUpdateDoc = {
                $set: {
                    requestStatus: "approved",
                    approvalDate: new Date(),
                    processedBy: requestResult.hrEmail
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



        //           REJECT REQUEST API
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
                    rejectionDate: new Date(),
                    processedBy: requestResult.hrEmail
                }
            };
            const requestUpdateResult = await requestCollection.updateOne(requestQuery, requestUpdateDoc);

            res.send({
                success: true,
                message: "Request rejected successfully",
                requestUpdateResult
            });
        });



        //           EMPLOYEE LIST API
        app.get("/hr/employee-list", async (req, res) => {
            const { hrEmail } = req.query;

            // HR Info
            const query = { email: hrEmail, role: "hr" };
            const options = {
                projection: { packageLimit: 1, currentEmployees: 1 }
            };
            const hrInfo = await userCollection.findOne(query, options)


            const pipeline = [

                {
                    $match: {
                        hrEmail,
                        status: "active"
                    }
                },

                {
                    $lookup: {
                        from: "assignedAssets",
                        localField: "employeeEmail",
                        foreignField: "employeeEmail",
                        as: "assets"
                    }
                },

                {
                    $lookup: {
                        from: "users",
                        localField: "employeeEmail",
                        foreignField: "email",
                        as: "user"
                    }
                },

                {
                    $project: {
                        _id: 1,
                        name: "$employeeName",
                        email: "$employeeEmail",
                        joinDate: "$affiliationDate",
                        assetCount: {
                            $size: {
                                $filter: {
                                    input: "$assets",
                                    as: "a",
                                    cond: { $eq: ["$$a.hrEmail", hrEmail] }
                                }
                            }
                        },
                        photoURL: { $arrayElemAt: ["$user.photoURL", 0] },

                        // For My Team page 
                        dateOfBirth: { $arrayElemAt: ["$user.dateOfBirth", 0] },
                        position: { $arrayElemAt: ["$user.position", 0] }
                    }
                }
            ];

            const result = await affiliationCollection.aggregate(pipeline).toArray();

            res.send({
                result,
                used: result.length,
                limit: hrInfo?.packageLimit || 0
            });
        });
         
        //              EMPLOYEE REMOVE API
        app.patch("/hr/remove-employee", async (req, res) => {
            const { hrEmail, employeeEmail } = req.body;

            // HR Check
            const hrResult = await userCollection.findOne({
                email: hrEmail,
                role: "hr"
            });

            if (!hrResult) {
                return res.send({ success: false, message: "Unauthorized" });
            }


            const affiliationQuery = {
                hrEmail,
                employeeEmail,
                status: "active"
            };

            const affiliationResult = await affiliationCollection.findOne(affiliationQuery);

            if (!affiliationResult) {
                return res.send({ success: false, message: "Employee not found" });
            }


            const approvedQuery = {
                hrEmail,
                employeeEmail,
                status: "approved"
            }
            const assignedAssetsResult = await assignedAssetCollection.find(approvedQuery).toArray();


            const returnUpdate = {
                $set: {
                    status: "returned",
                    returnDate: new Date()
                }
            }
            const returnAssetsResult = await assignedAssetCollection.updateMany(approvedQuery, returnUpdate);


            // Increase asset available quantity
            const assetIds = assignedAssetsResult.map(a => a.assetId);
            const assetId = { _id: { $in: assetIds } }
            const updateQuantity = { $inc: { availableQuantity: 1 } }

            const assetQuantityUpdateResult = await assetCollection.updateMany(assetId, updateQuantity);


            // Remove Employee
            const updateEmployeeStatus = {
                $set: {
                    status: "inactive",
                    removedAt: new Date()
                }
            }
            const removeAffiliationResult = await affiliationCollection.updateOne(affiliationQuery, updateEmployeeStatus);


            // Reduce HR Employee Count
            const hrEmailQuery = { email: hrEmail }
            const updateEmployee = { $inc: { currentEmployees: -1 } }
            const hrUpdateResult = await userCollection.updateOne(hrEmailQuery, updateEmployee);


            res.send({
                success: true,
                message: "Employee removed from team successfully",
                results: {
                    returnedAssets: returnAssetsResult.modifiedCount,
                    assetsUpdated: assetQuantityUpdateResult.modifiedCount,
                    affiliationRemoved: removeAffiliationResult.modifiedCount,
                    hrEmployeeUpdated: hrUpdateResult.modifiedCount
                }
            });
        });




        //              EMPLOYEE RELATED APIS

        //            AVAILABLE ASSET API 
        app.get("/employee/assets", async (req, res) => {
            const query = {
                availableQuantity: { $gt: 0 }
            }
            const result = await assetCollection.find(query).toArray();
            res.send(result);
        });



        //            REQUEST AN ASSET
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



        //            MY ASSETS API
        app.get("/assigned-assets", async (req, res) => {
            const { email, search, filter } = req.query;

            let query = { employeeEmail: email };

            if (search) {
                query.assetName = { $regex: search, $options: "i" };
            }

            if (filter && filter !== "All") {
                query.assetType = filter;
            }

            const result = await assignedAssetCollection
                .find(query)
                .sort({ assignmentDate: -1 })
                .toArray();

            res.send(result);
        });


        //          GET ALL COMPANIES
        app.get('/hr/companies', async (req, res) => {
            try {
                const companies = await userCollection
                    .find({ role: "hr" })
                    .project({ _id: 1, companyName: 1, email: 1 })
                    .toArray();
                res.send(companies);
            } catch (err) {
                console.error(err);
                res.status(500).send({ success: false, message: "Failed to fetch companies" });
            }
        });



        //               PAYMENT RELATED APIS

        //       UPGRADE PACKAGES
        app.get('/packages', async (req, res) => {
            const result = await packagesCollection.find().toArray();
            res.send(result);
        })


        //            PAYMENT INTEGRATION STRIPE 
        app.post('/hr/create-checkout-session', async (req, res) => {
            try {
                const { hrEmail, packageName } = req.body;


                const packageData = await packagesCollection.findOne({ name: packageName });

                if (!packageData) {
                    return res.status(404).send({ message: "Package not found" });
                }
                const amount = packageData.price * 100;


                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [{
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: `Upgrade Package: ${packageName}`
                            },
                        },
                        quantity: 1
                    }],
                    mode: 'payment',
                    customer_email: hrEmail,
                    metadata: {
                        hrEmail,
                        packageName
                    },
                    success_url: `${process.env.SITE_DOMAIN}/dashboard/hr/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/hr/payment-cancelled`
                });

                res.send({ url: session.url });

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Stripe session creation failed' });
            }
        });


        //              PAYMENT SUCCESS
        app.patch('/hr/payment-success', async (req, res) => {
            try {
                const sessionId = req.query.session_id;
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                // Double Transaction Stop
                const transactionId = session.payment_intent;

                // Check duplicate transaction
                const paymentExist = await paymentsCollection.findOne({ transactionId });
                if (paymentExist) {
                    return res.send({ message: 'Payment already exists', transactionId });
                }

                if (session.payment_status === 'paid') {

                    const packageData = await packagesCollection.findOne({
                        name: session.metadata.packageName
                    });

                    const payment = {
                        hrEmail: session.metadata.hrEmail,
                        packageName: session.metadata.packageName,
                        employeeLimit: packageData.employeeLimit,
                        amount: session.amount_total / 100,
                        currency: session.currency,
                        transactionId: transactionId,
                        paymentDate: new Date(),
                        status: "completed"
                    };

                    const result = await paymentsCollection.insertOne(payment);

                    // Update HR user's package in users collection
                    await userCollection.updateOne(
                        { email: session.metadata.hrEmail },
                        {
                            $set: {
                                subscription: session.metadata.packageName
                            },
                            $inc: {
                                packageLimit: packageData.employeeLimit
                            }
                        }
                    );


                    // Update HR currentEmployees count
                    const activeEmployeesCount = await affiliationCollection.countDocuments({
                        hrEmail: session.metadata.hrEmail,
                        status: "active"
                    });

                    await userCollection.updateOne(
                        { email: session.metadata.hrEmail },
                        { $set: { currentEmployees: activeEmployeesCount } }
                    );


                    res.send({
                        success: true,
                        transactionId: transactionId,
                        paymentRecord: result
                    });
                } else {
                    res.send({ success: false });
                }

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Payment processing failed' });
            }
        });


        //          PAYMENT HISTORY
        app.get('/hr/payments', async (req, res) => {
            const { hrEmail } = req.query;

            const payments = await paymentsCollection
                .find({ hrEmail })
                .sort({ paymentDate: -1 })
                .toArray();

            res.send(payments);
        });



        //           SHARED PROFILE FOR (HR & EMPLOYEE)

        // GET USER PROFILE
        app.get("/profile/:email", async (req, res) => {
            const email = req.params.email;

            const user = await userCollection.findOne(
                { email },
                { projection: { password: 0 } }
            );

            if (!user) {
                return res.send({ success: false, message: "User not found" });
            }

            // Employee affiliation 
            const affiliations = await affiliationCollection.find({
                employeeEmail: email,
                status: "active"
            }).toArray();

            res.send({
                success: true,
                user,
                affiliations
            });
        });


        // UPDATE PROFILE
        app.patch("/profile/update", async (req, res) => {
            const { email, name, photoURL, dateOfBirth } = req.body;

            const result = await userCollection.updateOne(
                { email },
                {
                    $set: {
                        name,
                        photoURL,
                        dateOfBirth
                    }
                }
            );

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