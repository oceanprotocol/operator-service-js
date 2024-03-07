import express from "express";
import { LOG_LEVELS_STR } from "../utils/logger";
import { initPgSql } from "../handlers";
import { checkAdmin } from "../utils";
import { getJobInfo, getJobLogs, listJobs } from "../handlers/adminHandlers";

export const adminRoutes = express.Router();

adminRoutes.get("/pgsqlinit", async (req, res) => {
	try {
		const output = await initPgSql(req.headers["Admin"] as string);
		return res.status(200).json({ message: output });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "Error initializing PostgreSQL database" });
	}
});

adminRoutes.get("/info", async (req, res) => {
	try {
		const admin = req.headers["Admin"] as string;
		const msg = await checkAdmin(admin); // Assuming this function uses Kubernetes API

		if (msg) {
			throw new Error(msg[0]);
		}

		const jobId = req.query.jobId as string; // Type casting for safety

		const apiResponse = await getJobInfo(jobId); // Placeholder function

		return res.status(200).json(apiResponse);
	} catch (error) {
		console.error(error);
		res.status(400).json(`Error retrieving job information: ${error.message}`);
	}
});

adminRoutes.get("/logs", async (req, res) => {
	try {
		console.log(
			`GET logs request received with query: ${JSON.stringify(req.query)}`,
			true
		);
		const admin = req.headers.Admin as string;
		const jobId = req.query.jobId as string;
		const component = req.query.component as string;

		if (!admin || !jobId || !component) {
			console.log(
				`You have to specify jobId in the query string: ${JSON.stringify(req.query)}`,
				true
			);
			return res.status(400).send("Missing parameters");
		}
		const label = `workflow=${jobId}, component=${component}`;
		const logs = await getJobLogs(admin, label);
		res.status(200).send(logs);
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});

adminRoutes.get("/list", async (req, res) => {
	try {
		console.log(
			`GET info request received with query: ${JSON.stringify(req.query)}`,
			true
		);
		const admin = req.headers.Admin as string;

		if (!admin) {
			console.log(
				`You have to specify jobId in the query string: ${JSON.stringify(req.query)}`,
				true
			);
			return res.status(400).send("Missing parameters");
		}
		const list = await listJobs(admin);
		res.status(200).send();
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});
