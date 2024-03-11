import express from "express";
import { LOG_LEVELS_STR } from "../utils/logger";
import { GetIndexedResultQuery } from "../@types/results";
import {
	buildDownloadResponse,
	checkRequiredAttributes,
	processProviderSignatureValidation,
} from "../utils";
import { getJobByProviderAndOwner, getSqlJobUrls } from "../database";

export const resultsRoutes = express.Router();

resultsRoutes.get("/getResult", async (req, res) => {
	try {
		const data: GetIndexedResultQuery = req.query;

		if (!data.index || !data.jobId) {
			return res
				.status(400)
				.json({ error: "Both index and jobId are required" });
		}

		const requiredAttributes = [
			"owner",
			"providerSignature",
			"nonce",
			"index",
			"jobId",
		];
		const { message, statusCode: status } = checkRequiredAttributes(
			requiredAttributes,
			data,
			"GET:/getResult"
		);
		if (message) {
			return res.status(status).json({ error: message });
		}

		const { index, jobId, owner, providerSignature, nonce } = data;

		const {
			message: messageSignatureValidation,
			statusCode,
			address: providerAddress,
		} = await processProviderSignatureValidation(
			providerSignature,
			`${owner}${jobId}`,
			nonce
		);
		if (message) {
			return res.status(status).json({ error: message });
		}

		const outputs = await getSqlJobUrls(jobId);
		const outputOwner = outputs[1];

		if (owner !== outputOwner) {
			return res
				.status(404)
				.json({ error: `Owner ${owner} mismatch for job ${jobId}` });
		}

		const wantedJobs = await getJobByProviderAndOwner(owner, providerAddress);
		if (!wantedJobs) {
			return res.status(404).json({
				error: `Provider ${providerAddress} mismatch for job ${jobId}`,
			});
		}

		if (!outputs || !Array.isArray(outputs)) {
			return res.status(404).json({ error: `No results for job ${jobId}` });
		}

		if (index < 0) {
			return res.status(404).json({ error: `Negative index ${index}` });
		}

		if (index >= outputs.length) {
			return res
				.status(404)
				.json({ error: `No such index ${index} in this compute job` });
		}

		try {
			const downloadResponse = await buildDownloadResponse(
				req,
				res,
				outputs[index].url
			);
			return res.status(200).send(downloadResponse);
		} catch (error) {
			console.error(`Error building download response: ${error}`);
			return res
				.status(400)
				.json({ error: "Error building download response" });
		}
	} catch (error) {
		console.log(LOG_LEVELS_STR.LEVEL_ERROR, `Error: ${error}`);
		res.status(500).send("Internal Server Error");
	}
});
