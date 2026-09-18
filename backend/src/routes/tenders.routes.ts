import { Router } from 'express';
import { listTenders, getTenderById } from '../controllers/tenders.controller.js';

const router = Router();

router.get('/', listTenders);
router.get('/:id', getTenderById);

export default router;
