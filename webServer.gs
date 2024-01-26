var ss = SpreadsheetApp.getActiveSpreadsheet();
var page_sheet = ss.getSheetByName("page_data");
var orderSheet = ss.getSheetByName("발주");
var cartSheet = ss.getSheetByName("고객 장바구니");
var companySheet = ss.getSheetByName("회사");
var orderTotal;
function doGet() {
	return HtmlService.createTemplateFromFile("index").evaluate();
}
function include(filename) {
	return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
function test() {
	var lastRow = orderSheet.getLastRow();
	Logger.log(lastRow);
}
// create
function sendSubmission(submission) {
	orderSheet.insertRowBefore(2);
	// generate id
	var lastRow = orderSheet.getLastRow();
	var orderNo = lastRow - 2;
	var orderNoString = orderNo.toString();
	submission.unshift(orderNoString);
	var currentDate = new Date();
	var formattedDate = Utilities.formatDate(
		currentDate,
		Session.getScriptTimeZone(),
		"yyyy/MM/dd HH:mm:ss"
	);
	submission[3] = formattedDate;

	var length = submission.length;
	var newRowRange = orderSheet.getRange(2, 1, 1, length);
	newRowRange.setValues([submission]);

	var recipient = submission[2].replace(/\D/g, "");
	var companyName = companySheet.getRange(2, 3).getValue();
	var custName = submission[1];

	var orderSummary = generateSummary(submission);
	var accountNo = companySheet.getRange(3, 3).getValue();
	var accountOwner = companySheet.getRange(4, 3).getValue();
	var address = submission[6];
	var companyContact = companySheet.getRange(6, 3).getValue();
	var link = companySheet.getRange(7, 3).getValue();
	var sender = companySheet.getRange(8, 3).getValue();
	sendMessage(
		recipient,
		companyName,
		custName,
		orderNoString,
		orderSummary,
		accountNo,
		accountOwner,
		address,
		companyContact,
		link,
		sender
	);
	return orderSummary;
}

function newUser(phoneNo) {
	cartSheet.insertRowBefore(2);
	var newRange = cartSheet.getRange(2, 1, 1, 2);
	newRange.setValues([["", phoneNo]]);
	return null;
}

// initialize
function getEBookMetaData() {
	var page_data = page_sheet.getDataRange().getValues();
	var fiddler = new bmFiddler.Fiddler();
	fiddler.setValues(page_data);

	var data = fiddler.getData();
	var filteredData = data.filter(isNotEmptyPage);
	var ebookMetadata = filteredData.map(function (page) {
		return {
			pageNo: page["0"],
			content: page["text"],
			imageID: page["image_id"],
			imageName: page["page_name"],
			category: page["category"],
			businessName: page["businessName"],
			contactInfo: page["contact_info"],
			sgtAccount: page["SGT_account"],
			bankAccount: page["bank_account"],
			items: [
				{
					name: page["item_1"],
					price: page["item_1_price"],
					code: page["item_1_code"],
				},
				{
					name: page["item_2"],
					price: page["item_2_price"],
					code: page["item_2_code"],
				},
				{
					name: page["item_3"],
					price: page["item_3_price"],
					code: page["item_3_code"],
				},
				{
					name: page["item_4"],
					price: page["item_4_price"],
					code: page["item_4_code"],
				},
				{
					name: page["item_5"],
					price: page["item_5_price"],
					code: page["item_5_code"],
				},
				{
					name: page["item_6"],
					price: page["item_6_price"],
					code: page["item_6_code"],
				},
				{
					name: page["item_7"],
					price: page["item_7_price"],
					code: page["item_7_code"],
				},
			].filter((item) => item.name || item.price), // Filter out empty items
		};
	});
	return ebookMetadata;
}

function getImageDataUrl(imageId) {
	var fileBlob = DriveApp.getFileById(imageId).getBlob();
	var dataUrl =
		"data:" +
		fileBlob.getContentType() +
		";base64," +
		Utilities.base64Encode(fileBlob.getBytes());
	return dataUrl;
}

function getUserCart(phoneNo) {
	Logger.log(phoneNo);
	var cartData = cartSheet.getDataRange().getValues();
	var fiddler = new bmFiddler.Fiddler();
	fiddler.setValues(cartData);
	var data = fiddler.getData();

	var carts = data.filter(function (cart) {
		return cart["contact"] == phoneNo;
	});

	var cartHistory = carts.length > 0 ? carts[0] : null; // Return the first match, or null if not found
	Logger.log(cartHistory);
	if (cartHistory) {
		var userHistory = transformAndFilterItems(cartHistory);
		Logger.log(userHistory);
		return userHistory;
	}
	return null;
}

function transformAndFilterItems(cartHistory) {
	// Function to extract item number (X) from a key
	function extractItemNumber(key) {
		const match = key.match(/^item_(\d+)_/);
		return match ? parseInt(match[1], 10) : null;
	}

	const itemsArray = [];
	// Match keys for items, codes, and amounts
	const keys = Object.keys(cartHistory).filter((key) =>
		/^item_\d+(_.+)?$/.test(key)
	);
	let itemNumbers = new Set(keys.map(extractItemNumber));

	itemNumbers.forEach((number) => {
		if (number === null) return; // Skip if no number was found
		const codeKey = `item_${number}_code`;
		const nameKey = `item_${number}`;
		const pcsKey = `item_${number}_pcs`;
		const amountKey = `item_${number}_amt`;

		let code = cartHistory[codeKey] || "";
		let name = cartHistory[nameKey] || "";
		let pcsString = cartHistory[pcsKey] || "0";
		let amountString = cartHistory[amountKey] || "0";

		if (name && code) {
			// Ensure item has a name and code
			itemsArray.push({
				code: code,
				name: name,
				amount: parseInt(pcsString, 10),
				price: parseInt(amountString, 10),
			});
		}
	});

	return itemsArray;
}

function generateSummary(submission) {
	var summary = `일시: ${submission[3]}\n`;

	var total = 0; // Initialize a variable to keep track of the total
	var index = 0;
	// Iterate over the items in the submission array
	for (var i = 8; i < submission.length; i += 4) {
		var item = submission[i];
		var itemCode = submission[i + 1];
		var itemPcs = submission[i + 2];
		var itemAmt = submission[i + 3];
		var itemTotal = itemPcs * itemAmt;
		// Update the total
		total += itemAmt * itemPcs;
		index++;
		summary += `(${index}) ${item}(${itemCode}) x ${itemPcs}개 = ${formatWon(
			itemTotal
		)}원\n`;
	}

	orderTotal = formatWon(total);
	orderTotal += "원";
	return summary;
}
function formatWon(data) {
	if (data !== null && data !== undefined) {
		return data.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	} else {
		return "0";
	}
}

function sendMessage(
	recipient,
	companyName,
	custName,
	orderNoString,
	orderSummary,
	accountNo,
	accountOwner,
	address,
	companyContact,
	link,
	sender
) {
	var url = "https://api.solapi.com/messages/v4/send-many/detail";
	var payload = {
		messages: [
			{
				to: recipient,
				from: sender,
				type: "ATA",
				kakaoOptions: {
					pfId: "KA01PF231204032809766yxUKawHuwkZ",
					templateId: "KA01TP240116050447485ZisyUndQ5vi",
					variables: {
						"#{상점명}": companyName,
						"#{구매자명}": custName,
						"#{주문번호}": orderNoString,
						"#{(1) A 세트 (setA) x 1 = 300,000원}": orderSummary,
						"#{주문합계}": orderTotal,
						"#{입금계좌}": accountNo,
						"#{입금인명}": accountOwner,
						"#{주소}": address,
						"#{연락처}": companyContact,
						"#{쇼핑몰 링크}": link,
					},
				},
			},
		],
	};
	Logger.log(payload);
	var now = new Date().toISOString();
	var genRanHex = (size) =>
		[...Array(size)]
			.map(() => Math.floor(Math.random() * 16).toString(16))
			.join("");
	var salt = genRanHex(64);
	var message = now + salt;
	var apiKey = "NCS2ZACFCYPV306M";
	var apiSecret = "9CIAMIQ3DDRBBV6BXJO8CIKIHCTUH7CS";
	var signature = Utilities.computeHmacSha256Signature(message, apiSecret);
	var signatureHex = signature.reduce(function (str, chr) {
		var hex = (chr < 0 ? chr + 256 : chr).toString(16);
		return str + (hex.length === 1 ? "0" : "") + hex;
	}, "");
	var options = {
		method: "post",
		headers: {
			Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${now}, salt=${salt}, signature=${signatureHex}`,
		},
		contentType: "application/json",
		payload: JSON.stringify(payload),
	};

	var response = UrlFetchApp.fetch(url, options);
	var data = JSON.parse(response.getContentText());
	Logger.log(data); // Log the response for debugging
}

//update
function saveCartItems(submission, phoneNo) {
	var data = cartSheet.getDataRange().getValues();
	var found = false; // This will be true if we find the email in the sheet
	var indicesToRemove = [6, 5, 4, 3, 2]; // Start with highest index to avoid shifting issues
	indicesToRemove.forEach((index) => {
		if (index < submission.length) {
			submission.splice(index, 1);
		}
	});
	submission[1] = phoneNo;
	// Loop over the data to find the phoneNo
	for (var i = 0; i < data.length; i++) {
		if (data[i][1] == phoneNo) {
			var row = i + 1; // Adding 1 because array is 0-indexed but sheet rows are 1-indexed
			var range = cartSheet.getRange(row, 1, 1, cartSheet.getLastColumn());
			range.clearContent();

			var range = cartSheet.getRange(row, 1, 1, submission.length);
			range.setValues([submission]);
			found = true; // Indicate that we've found the email and updated the row
			break; // No need to continue looping
		}
	}
	// If the email has not been found, add a new row at the top (underneath headers if any)
	if (!found) {
		cartSheet.insertRowBefore(2); // Inserts a new second row; assumes first row is headers
		var newRange = cartSheet.getRange(2, 1, 1, submission.length);
		newRange.setValues([submission]);
	}
}

function isNotEmptyPage(page) {
	// Check if the required fields have values. You can expand this logic to include all fields you consider necessary for a page to be considered "non-empty".
	return !!(
		page["text"] ||
		page["image_id"] ||
		page["page_name"] ||
		page["category"] ||
		page["businessName"] ||
		page["contact_info"] ||
		page["SGT_account"] ||
		page["bank_account"] ||
		page["item_1"] ||
		page["item_2"] ||
		page["item_3"] ||
		page["item_4"] ||
		page["item_5"] ||
		page["item_6"] ||
		page["item_7"]
	);
}
