import { Router } from 'express';
import { listBids, getBidById } from '../controllers/bids.controller.js';

const router = Router();

router.get('/', listBids);
router.get('/:id', getBidById);

export default router;
