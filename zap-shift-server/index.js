const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// ----strip =---
const stripe = require('stripe')(process.env.STRIPE);


const port = process.env.PORT || 3000

// --genared tokon ---
const crypto = require("crypto");

function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}

/// middleware
app.use(express.json())
app.use(cors())

// ----- mongodb----
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.zfo7i3z.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
// ---connection -----
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // ====create Db ===
        const db = client.db("zpa_shift_DB");
        const parcelCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");


        // --- parcel api ---
        app.get('/parcels', async (req, res) => {
            // console.log(res)
            const query = {}
            const { email } = req.query
            // // parcel?email=&name=
            if (email) {
                query.senderEmail = email
            }
            const options = { sort: { createdAt: -1 } }
            const cursor = parcelCollection.find(query, options)
            const result = await cursor.toArray()
            res.send(result)
        })
        app.get(`/parcels/:id`, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollection.findOne(query)
            res.send(result)
        })
        app.post('/parcels', async (req, res) => {
            // console.log(req)
            const parcel = req.body
            //parcel created time
            parcel.createdAt = new Date()
            const result = await parcelCollection.insertOne(parcel)
            res.send(result)
        })
        app.delete(`/parcels/:id`, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await parcelCollection.deleteOne(query)
            res.send(result)
        })

        // -------payment reledated api ---------

        // --new--
        app.post('/payment-checkout-session', async (req, res) => {
            const paymentInfo = req.body
            const amount = Number(paymentInfo.cost)
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            unit_amount: amount * 100,
                            product_data: {
                                name: `please pay for ${paymentInfo.parcelName}`
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName
                },
                customer_email: paymentInfo.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cencelled`
            })
            res.send({ url: session.url })
        })
        // ---- old ---
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body
            const amount = parseInt(paymentInfo.cost) * 100
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            }
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cencelled`,
            });
            console.log(session)
            res.send({ url: session.url })
        })

        // -data upadet --
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            const session = await stripe.checkout.sessions.retrieve(sessionId)
            const trackingId = generateTrackingId()

            if (session.payment_status === 'paid') {
                const id = session.metadata.parcelId
                const query = { _id: new ObjectId(id) }
                const updateData = {
                    $set: {
                        paymentStatus: 'paid',
                        trackingId: trackingId

                    }
                }
                const result = await parcelCollection.updateOne(query, updateData)
                const paymentData = {
                    customerEmail: session.customer_email,
                    currency: session.currency,
                    amount: session.amount_total / 100,
                    paymentStatus: session.payment_status,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionalId: session.payment_intent,

                    paidAt: new Date()
                }
                if (session.payment_status === 'paid') {
                    const paymentResult = await paymentCollection.insertOne(paymentData)
                    res.send({
                        success: true,
                        trackingId: trackingId,
                        transactionalId: session.payment_intent,
                        modifyParcel: result,
                        paymentInfo: paymentResult
                    })
                }
            }
            console.log('seeion :', session)
            res.send({ success: false })
        })
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);
// ---- output Api ----
app.get('/', (req, res) => {
    res.send('Zap Shift Server is runing bro!!!!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})