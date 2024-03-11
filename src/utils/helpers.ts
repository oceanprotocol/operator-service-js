import Decimal from "decimal.js";
import path from "path";
import mime from "mime";
import fs from "fs";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { HelperResponse } from "../@types";

export function getListOfAllowedProviders(): string[] {
	try {
		const allowedList = JSON.parse(process.env.ALLOWED_PROVIDERS || "[]");
		if (!Array.isArray(allowedList)) {
			console.error("Failed loading ALLOWED_PROVIDERS");
			return [];
		}
		return allowedList.map((p) => p.toLowerCase());
	} catch (error) {
		console.error(`Error parsing ALLOWED_PROVIDERS: ${error}`);
		return [];
	}
}

export function checkRequiredAttributes(
	requiredAttributes: string[],
	data: any,
	method: string
): HelperResponse {
	console.debug(`Got ${method} request: ${JSON.stringify(data)}`);
	if (!data || typeof data !== "object") {
		console.error(`${method} request failed: data is empty.`);
		return { message: "Payload seems empty.", statusCode: 400 };
	}

	for (const attribute of requiredAttributes) {
		if (!(attribute in data)) {
			console.error(
				`${method} request failed: required attribute ${attribute} missing.`
			);
			return {
				message: `"${attribute}" is required in the call to ${method}`,
				statusCode: 400,
			};
		}
	}

	return { message: "", statusCode: null };
}

export async function checkAdmin(
	admin: string | undefined
): Promise<HelperResponse> {
	try {
		const allowedAdmins: string[] = JSON.parse(
			process.env.ALLOWED_ADMINS || "[]"
		);

		if (!admin) {
			const errorMessage = "Admin header is empty.";
			console.error(errorMessage);
			return { message: errorMessage, statusCode: 400 };
		}

		if (!allowedAdmins.includes(admin.toLowerCase())) {
			const errorMessage =
				"Access admin route failed due to invalid admin address.";
			console.error(errorMessage);
			return { message: errorMessage, statusCode: 401 };
		}

		console.info("Valid admin.");
		return { message: "Valid admin.", statusCode: 200 };
	} catch (error) {
		console.error("Error checking admin:", error);
		return { message: "Internal server error", statusCode: 500 };
	}
}

export function getNamespaceConfigs(): { [key: string]: string } {
	const resources: { [key: string]: string } = {};
	resources["namespace"] = process.env.DEFAULT_NAMESPACE || "ocean-compute";
	return resources;
}

/**
 * Sanitizes objects to send them to provider by recursively converting Decimal and float values to strings.
 *
 * @param d The object to be sanitized. Can be a dict, list, tuple, set, str, int, float, or None.
 * @returns The sanitized object.
 */
export function sanitizeResponseForProvider(d: any): any {
	if (d instanceof Decimal) {
		return d.toString();
	} else if (typeof d === "number" && Number.isFinite(d)) {
		return d.toString();
	} else if (typeof d === "object" && d !== null) {
		if (Array.isArray(d)) {
			return d.map(sanitizeResponseForProvider);
		} else {
			return Object.fromEntries(
				Object.entries(d).map(([key, value]) => [
					key,
					sanitizeResponseForProvider(value),
				])
			);
		}
	} else {
		return d;
	}
}

export function generateNewId(): string {
	return uuidv4().toString();
}

export function isVerifySignatureRequired(): boolean {
	try {
		return process.env.SIGNATURE_REQUIRED === "1";
	} catch (error) {
		return false;
	}
}

export async function buildDownloadResponse(
	request: Request,
	requestsSession: any,
	url: string,
	content_type?: string
): Promise<Response> {
	return new Promise((resolve, reject) => {
		try {
			let downloadRequestHeaders: any = {};
			let downloadResponseHeaders: any = {};
			const isRangeRequest: boolean = !!request.headers.range;

			if (isRangeRequest) {
				downloadRequestHeaders = { Range: request.headers.range };
				downloadResponseHeaders = downloadRequestHeaders;
			}

			// IPFS utils
			const ipfsXApiKey: string | undefined = process.env.X_API_KEY;
			if (ipfsXApiKey) {
				downloadRequestHeaders["X-API-KEY"] = ipfsXApiKey;
			}
			const ipfsClientId: string | undefined = process.env.CLIENT_ID;
			if (ipfsClientId) {
				downloadRequestHeaders["CLIENT-ID"] = ipfsClientId;
			}

			const options = {
				url: url,
				headers: downloadRequestHeaders,
				timeout: 3000,
			};

			requestsSession(options, (error: any, response: any) => {
				if (error) {
					reject(error);
				} else {
					let filename: string = path.basename(url);
					if (!isRangeRequest) {
						const contentDispositionHeader: string | undefined =
							response.headers["content-disposition"];
						if (contentDispositionHeader) {
							const [, contentDispositionParams] = contentDispositionHeader
								.split(";")
								.map((item) => item.trim());
							const contentFilename: string | undefined =
								contentDispositionParams.split("=")[1];
							if (contentFilename) {
								filename = contentFilename.replace(/['"]+/g, "");
							}
						}

						const contentTypeHeader: string | undefined =
							response.headers["content-type"];
						if (contentTypeHeader) {
							content_type = contentTypeHeader;
						}

						const fileExt: string = path.extname(filename);
						if (fileExt && !content_type) {
							content_type = mime.getType(filename);
							const extension: string | false = mime.extension(content_type);
							if (extension) {
								filename = `${filename}.${extension}`;
							}
						}

						downloadResponseHeaders = {
							"Content-Disposition": `attachment;filename=${filename}`,
							"Access-Control-Expose-Headers": "Content-Disposition",
						};
					}

					const stream = fs.createReadStream(response.body);
					stream.on("error", (err) => {
						reject(err);
					});

					resolve(response.statusMessage);
					response.on("error", (err: any) => {
						reject(err);
					});
					response.on("end", () => {
						resolve(null);
					});

					return new Response(stream as any, {
						...downloadResponseHeaders,
						content_type,
					});
				}
			});
		} catch (e) {
			console.error(`Error preparing file download response: ${e}`);
			reject(e);
		}
	});
}
