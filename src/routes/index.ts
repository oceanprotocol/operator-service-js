import express, { Response } from "express";
import { computeRoutes } from "./compute";
import { environmentRoutes } from "./environment";
import { resultsRoutes } from "./results";
import { jobsRoutes } from "./jobs";

export const httpRoutes = express.Router();
httpRoutes.use(computeRoutes);
httpRoutes.use(environmentRoutes);
httpRoutes.use(resultsRoutes);
httpRoutes.use(jobsRoutes);
