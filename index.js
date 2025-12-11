const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000


// middleware
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
    res.send('AssetVerse server is running')
})

app.listen(port, () => {
    console.log(`AssetVerse server is running on port ${port}`)
})