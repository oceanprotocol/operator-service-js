const keys = new KeyAPI(new ECDSA(new Web3().eth));

export function getSigner(signature: string, message: string): string {
	const signatureBytes = Web3.utils.hexToBytes(signature);
	const newSignature =
		signatureBytes[64] === 27
			? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([0])])
			: signatureBytes[64] === 28
				? Buffer.concat([signatureBytes.slice(0, 64), Buffer.from([1])])
				: signatureBytes;
	const signatureObject = keys.Signature.fromSignatureBuffer(newSignature);
	const messageHash = Web3.utils.solidityKeccak(["bytes"], [message]);
	const prefix = Buffer.from("\x19Ethereum Signed Message:\n32");
	const signableHash = Web3.utils.solidityKeccak(
		["bytes", "bytes"],
		[prefix, messageHash]
	);
	const vkey = keys.recoverPublicKey(signableHash, signatureObject);
	return vkey.getAddress().toString();
}

export async function processProviderSignatureValidation(
	signature: string,
	originalMsg: string,
	nonce: number
): Promise<SignatureValidation> {
	try {
		const address = getSigner(signature, originalMsg);

		const dbNonce = await getNonceForCertainProvider(address);

		if (dbNonce && nonce <= dbNonce) {
			const errorMessage = `Invalid signature expected nonce (${dbNonce}) > current nonce (${nonce}).`;
			console.error(errorMessage);
			throw new InvalidSignatureError(errorMessage);
		} else {
			await updateNonceForProvider(nonce.toString(), address);
		}

		if (!signature || !originalMsg) {
			return {
				message: "`providerSignature` of agreementId is required.",
				statusCode: 400,
				address: null,
			};
		}

		originalMsg = `${originalMsg}${nonce}`;

		if (!getSigner(signature, originalMsg)) {
			return {
				message: "Invalid signature.",
				statusCode: 400,
				address: null,
			};
		}
		if (isVerifySignatureRequired()) {
			const allowedProviders = getListOfAllowedProviders();
			if (!allowedProviders.includes(address.toLowerCase())) {
				const errorMessage = `Invalid signature ${signature} of documentId ${originalMsg},
              the signing ethereum account ${address} is not authorized to use this service.`;
				return {
					message: errorMessage,
					statusCode: 401,
					address: null,
				};
			}
		}
		return {
			message: "",
			statusCode: null,
			address: address,
		};
	} catch (error) {
		console.error("Error processing provider signature validation:", error);
		return {
			message: "Internal server error",
			statusCode: 500,
			address: null,
		};
	}
}
