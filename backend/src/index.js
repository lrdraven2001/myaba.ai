require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const generateRoutes = require('./routes/generate');
const clientRoutes = require('./routes/clients');
const policyRoutes = require('./routes/policies');
const reviewRoutes = require('./routes/review');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? 'https://myaba.ai' : true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'myaba-api' }));

app.use('/api', generateRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/templates', policyRoutes); // shares same router, templates endpoint inside
app.use('/api/review-queue', reviewRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`myABA.ai API running on :${PORT}`);
  console.log(`ACLX Gateway: ${process.env.ACLX_GATEWAY_URL} (enabled=${process.env.ACLX_ENABLED})`);
});
