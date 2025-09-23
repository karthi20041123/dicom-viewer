// routes/ris.js
const axios = require('axios');
const router = express.Router();

router.get('/patient/:id', async (req, res) => {
  const response = await axios.get(`https://fhir-server/patient/${req.params.id}`);
  res.json(response.data);
});

export default router;