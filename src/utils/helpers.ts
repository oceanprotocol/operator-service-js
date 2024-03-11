import Decimal from "decimal.js";
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
