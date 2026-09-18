import { Router } from 'express';
import tendersRoutes from './tenders.routes.js';
import bidsRoutes from './bids.routes.js';
import verificationRoutes from './verification.routes.js';
import decisionsRoutes from './decisions.routes.js';

const router = Router();

router.use('/tenders', tendersRoutes);
router.use('/bids', bidsRoutes);
router.use('/verification', verificationRoutes);
router.use('/decisions', decisionsRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'csap-backend',
    timestamp: new Date().toISOString(),
  });
});

export default router;
