import express from "express";
import { makeGroupController } from "../controllers/groupController.js";

export default function groupRoutes({ pool, io }) {
  const router = express.Router();
  const { getGroups, drawGroups, resetGroups, assignOne } = makeGroupController({ pool, io });

  router.get("/:slug/groups", getGroups);
  router.post("/:slug/draw-groups", drawGroups);
  router.post("/:slug/reset-groups", resetGroups);
  router.post("/:slug/assign-one", assignOne);


  return router;
}
