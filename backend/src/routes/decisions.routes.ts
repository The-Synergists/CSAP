import { Router } from 'express';
import { submitDecision } from '../controllers/decisions.controller.js';

const router = Router();

router.post('/', submitDecision);

export default router;
