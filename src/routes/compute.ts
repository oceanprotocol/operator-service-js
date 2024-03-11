import express from "express";
import { LOG_LEVELS_STR } from "../utils/logger";
import {
	checkEnvironmentExists,
	createSqlJob,
	getSqlJobs,
	getSqlRunningJobs,
	getSqlStatus,
	stopSqlJob,
} from "../database";
import {
	checkRequiredAttributes,
	createComputeJob,
	generateNewId,
	processProviderSignatureValidation,
	sanitizeResponseForProvider,
} from "../utils";
import {
	GetComputeJobStatusQuery,
	StartComputeJobBody,
	StopComputeJobBody,
} from "../@types";

export const computeRoutes = express.Router();

computeRoutes.get("/compute", async (req, res) => {
	try {
		const data: GetComputeJobStatusQuery = req.body ?? req.query;

		if (!data.agreementId && !data.jobId && !data.owner) {
			const error = "You must specify one of agreementId, jobId, or owner";
			console.error(error);
			return res.status(400).json({ error });
		}

		const agreementId =
			data.agreementId?.length >= 2 ? data.agreementId : undefined;
		const owner = data.owner?.length >= 2 ? data.owner : undefined;
		const jobId = data.jobId?.length >= 2 ? data.jobId : undefined;
		const chainId = data.chainId;

		if (jobId) {
			const signMessage = `${owner}${jobId}`;
			const { message, statusCode, address } =
				await processProviderSignatureValidation(
					data.providerSignature,
					signMessage,
					parseInt(data.nonce)
				);
			if (message) {
				return res.status(statusCode).json({ error: message });
			}
			console.log(`Got valid signature from provider ${address}`);
		}

		console.log(
			`Received request for status: agreementId: ${agreementId}, jobId: ${jobId}, owner: ${owner}`
		);

		const apiResponse = await getSqlStatus(agreementId, jobId, owner, chainId);

		res.status(200).json(sanitizeResponseForProvider(apiResponse));
	} catch (error) {
		console.error(`Error getting job status: ${error}`);
		res.status(400).json({ error: "Error getting job status" });
	}
});

computeRoutes.post("/compute", async (req, res) => {
	try {
		const data: StartComputeJobBody = req.body || req.query; // Check for both body and query params

		// Required attributes validation
		const requiredAttributes = [
			"workflow",
			"agreementId",
			"owner",
			"providerSignature",
			"environment",
			"nonce",
		];
		const { message, statusCode: status } = checkRequiredAttributes(
			requiredAttributes,
			data,
			"POST:/compute"
		);
		if (message) {
			return res.status(status).json({ error: message });
		}

		const workflow = data.workflow;
		const agreementId = data.agreementId;
		const owner = data.owner;
		const nonce = data.nonce;

		if (!workflow) {
			return res.status(400).json({
				error:
					"`workflow` is required in the payload and must include workflow stages",
			});
		}
		workflow.chainId = data.chainId;

		try {
			const activeJobs = await getSqlRunningJobs();
			for (const job of activeJobs) {
				if (job.agreementId === agreementId) {
					return res
						.status(400)
						.json({ error: "`agreementId` already in use for other job." });
				}
			}
		} catch (error) {
			const errorMessage = `Error getting the active jobs for initializing a compute job: ${error}`;
			console.error(errorMessage);
			return res.status(400).json({ error: errorMessage });
		}
		const environment = data.environment;
		if (!checkEnvironmentExists(environment, workflow.chainId)) {
			console.error("Environment invalid or does not exist");
			return res
				.status(400)
				.json({ error: "Environment invalid or does not exist" });
		}

		// Verify provider signature
		const {
			message: signMessage,
			statusCode,
			address,
		} = await processProviderSignatureValidation(
			data.providerSignature,
			`${owner}`,
			nonce
		);
		if (message) {
			return res.status(statusCode).json({ error: signMessage });
		}

		const stages = workflow.stages;
		if (!stages) {
			console.error("Missing stages");
			return res.status(statusCode).json({ error: "Missing stages" });
		}
		if (stages.length > 1) {
			console.error("Multiple stages are not supported yet");
			return res
				.status(400)
				.json({ error: "Multiple stages are not supported yet" });
		}

		for (const attribute of ["algorithm", "compute", "input", "output"]) {
			if (!stages[0][attribute]) {
				console.error(`Missing ${attribute} in stage 0`);
				return res
					.status(400)
					.json({ error: `Missing ${attribute} in stage 0` });
			}
		}

		const jobId = generateNewId();
		console.log(`Got job_id: ${jobId}`);

		const body = createComputeJob(workflow, jobId, environment);
		body["metadata"]["secret"] = generateNewId();
		console.log(`Got body: ${JSON.stringify(body)}`);

		await createSqlJob(
			agreementId,
			jobId.toString(),
			owner,
			body,
			environment,
			address
		);
		const statusList = await getSqlStatus(
			agreementId,
			jobId.toString(),
			owner,
			workflow.chainId
		);

		return res.status(200).json(sanitizeResponseForProvider(statusList));
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});

computeRoutes.put("/compute", async (req, res) => {
	try {
		const data: StopComputeJobBody = req.body || req.query;

		const requiredAttributes = ["owner", "providerSignature", "nonce"];
		const { message, statusCode: status } = checkRequiredAttributes(
			requiredAttributes,
			data,
			"PUT:/compute"
		);
		if (message) {
			return res.status(status).json({ error: message });
		}

		const owner = data.owner;
		const providerSignature = data.providerSignature;
		const nonce = data.nonce;

		if (!(data.agreementId || data.jobId || owner)) {
			return res
				.status(400)
				.json({ error: "Specify one of agreementId, jobId, or owner" });
		}

		let agreementId = data.agreementId?.trim();
		let jobId = data.jobId?.trim();

		if (agreementId?.length < 2 && agreementId) {
			agreementId = null;
		}

		if (jobId?.length < 2 && jobId) {
			jobId = null;
		}

		if (!owner || owner.length < 2) {
			return res.status(400).json({ error: "Owner is invalid or missing" });
		}

		const signMessage = jobId ? `${owner}${jobId}` : owner;
		const {
			message: providerSignMessage,
			statusCode,
			address,
		} = await processProviderSignatureValidation(
			providerSignature,
			signMessage,
			nonce
		);
		if (message) {
			return res.status(statusCode).json({ error: providerSignMessage });
		}

		const jobsList = await getSqlJobs(agreementId, jobId, owner);
		for (const name of jobsList) {
			console.log(`Stopping job: ${name}`);
			stopSqlJob(name);
		}

		const statusList = sanitizeResponseForProvider(
			getSqlStatus(agreementId, jobId, owner, data.chainId)
		);

		return res.status(200).json(statusList);
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});

computeRoutes.delete("/compute", async (req, res) => {
	try {
		console.log(
			`GET compute request received with query: ${JSON.stringify(req.query)}`,
			true
		);
		const agreementId = req.query.agreementId as string;
		const jobId = req.query.jobId as string;
		const owner = req.query.owner as string;
		const providerSignature = req.query.providerSignature as string;

		if (!agreementId && !jobId && !owner && !providerSignature) {
			console.log(`'Missing parameters': ${JSON.stringify(req.query)}`, true);
			return res.status(400).send("Missing parameters");
		}
		return res
			.status(200)
			.send("Operator engine handles this, try to call that endpoint");
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});
