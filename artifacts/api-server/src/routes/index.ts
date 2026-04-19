import { Router, type IRouter } from "express";
import healthRouter from "./health";
import otpRouter from "./otp";
import usersRouter from "./users";
import chatsRouter from "./chats";
import statusesRouter from "./statuses";
import callsRouter from "./calls";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/otp", otpRouter);
router.use("/users", usersRouter);
router.use("/chats", chatsRouter);
router.use("/statuses", statusesRouter);
router.use("/calls", callsRouter);

export default router;
