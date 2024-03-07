import { Pool, PoolClient } from "pg"; // Assuming you're using pg
import { checkAdmin } from "../utils";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL, // Get connection string from environment variables
});

async function initPgSql(admin: string) {
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

async function executeQueries(client: PoolClient) {
	// Create the jobs table
	await client.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      agreementId varchar(255) NOT NULL,
      workflowId varchar(255) NOT NULL,
      owner varchar(255),
      status int,
      statusText varchar(255),
      laststatusupdate timestamp without time zone default NOW(),
      dateCreated timestamp without time zone default NOW(),
      dateFinished timestamp without time zone default NULL,
      configlogURL text,
      publishlogURL text,
      algologURL text,
      outputsURL text,
      ddo text,
      namespace varchar(255),
      stopreq smallint default 0,
      removed smallint default 0,
      workflow text,
      provider varchar(255),
      PRIMARY KEY (agreementId, workflowId)
    );
  `);

	// Create the envs table
	await client.query(`
    CREATE TABLE IF NOT EXISTS envs (
      namespace varchar(255) NOT NULL PRIMARY KEY,
      status text,
      lastping timestamp without time zone default NOW()
    );
  `);

	// Insert initial records into envs (replace with actual values)
	await client.query(`
    INSERT INTO envs (namespace, status)
    VALUES ('env1', 'active'), ('env2', 'inactive');
  `);
}

async function createOrUpdateTables(client: PoolClient) {
	// Replace with your table creation or update logic using the client
	await client.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ...");
	// ...
}

async function createIndices(client: PoolClient) {
	// Replace with your index creation logic using the client
	await client.query("CREATE INDEX IF NOT EXISTS ...");
	// ...
}

async function createFunction(client: PoolClient) {
	// Replace with your function creation logic using the client
	await client.query("CREATE OR REPLACE FUNCTION ...");
}
