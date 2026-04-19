import { Router, type IRouter } from "express";
import healthRouter from "./health";
import otpRouter from "./otp";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/otp", otpRouter);

export default router;
