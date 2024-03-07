import { checkAdmin } from "../utils";
import { Pool } from "pg"; // Assuming you're using pg

export async function initPgSql(admin: string) {
	const msg = await checkAdmin(admin);
	if (msg) {
		throw new Error(msg[0]);
	}

	try {
		const client = await pool.connect();
		try {
			await executeQueries(client);
			await createOrUpdateTables(client);
			await createIndices(client);
			await createFunction(client);
			await client.query("COMMIT");
			return "PostgreSQL database initialized successfully";
		} catch (error) {
			await client.query("ROLLBACK"); // Rollback any changes on error
			throw new Error(`Error PostgreSQL: ${error}`);
		} finally {
			client.release();
		}
	} catch (error) {
		throw new Error(error);
	}
}
