function onOpen() {
	var ui = SpreadsheetApp.getUi();
	ui.createMenu("Upload Catalogue")
		.addItem("Upload", "uploadFileSidebar")
		.addToUi();
}

function uploadFileSidebar() {
	var html = HtmlService.createTemplateFromFile("UploadFileSidebar").evaluate();
	html.setTitle("Upload File Sidebar");
	SpreadsheetApp.getUi().showSidebar(html);
}

function giveAccessToFolder(folderId) {
	var user = Session.getActiveUser().getEmail();
	var accessibleFolder = DriveApp.getFolderById(folderId);
	accessibleFolder.setOwner(user);
	var link = accessibleFolder.getUrl();
	return link;
}

function getFolder() {
	var folder,
		folders = DriveApp.getFoldersByName("Test - eCatalogueDB");
	if (folders.hasNext()) {
		folder = folders.next();
	} else {
		folder = DriveApp.createFolder("Test - eCatalogueDB");
	}
	var folderId = folder.getId();
	return folderId;
}

function uploadFile(folderId, fileObj) {
	var user = Session.getActiveUser().getEmail();
	var folder = DriveApp.getFolderById(folderId);
	var sheet = SpreadsheetApp.getActive().getSheetByName("Upload");

	// Decode from base64
	var decodedData = Utilities.base64Decode(fileObj.data);
	var blob = Utilities.newBlob(decodedData, fileObj.mimeType, fileObj.fileName);

	// Create file in Google Drive
	var uploadedFile = folder.createFile(blob);

	var type = uploadedFile.getMimeType();
	if (type === "application/pdf") {
		var uploadedFileId = uploadedFile.getId();
		convertToImage(uploadedFile.getName(), uploadedFileId, folder, sheet);
	} else {
		uploadedFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
	}
	addFileDataToSheet(sheet, uploadedFile);
}

function convertToImage(pdfFileName, pdfFileId, destinationFolder, sheet) {
	// Assume `PDFApp` is a library that has a `convertPDFToPng` function
	const pdfBlob = DriveApp.getFileById(pdfFileId).getBlob();

	// Convert each PDF page to a PNG image
	PDFApp.setPDFBlob(pdfBlob)
		.convertPDFToPng()
		.then((imageBlobs) => {
			imageBlobs.forEach((imageBlob, index) => {
				var imageName =
					pdfFileName.replace(".pdf", "") + "_Page_" + (index + 1) + ".png";
				var imageFile = destinationFolder.createFile(
					imageBlob.setName(imageName)
				);
				imageFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
				addFileDataToSheet(sheet, imageFile);
			});
		})
		.catch((err) => Logger.log(err));
}

function addFileDataToSheet(sheet, file) {
	var link = file.getUrl();
	var name = file.getName();
	var type = file.getMimeType();
	var size = file.getSize();
	var id = file.getId();
	var date = Utilities.formatDate(
		new Date(),
		Session.getScriptTimeZone(),
		"yyyy-MM-dd HH:mm:ss"
	);

	var row = [date, name, link, type, size, id];
	sheet.insertRowBefore(2);
	sheet.getRange(2, 1, 1, row.length).setValues([row]);
}

function ocrImageFiles(fileId) {
	var file = DriveApp.getFileById(fileId);
	var blob = file.getBlob();
	var imageName = file.getName();
	var docName = imageName.split(".")[0];
	var file = {
		title: docName,
		mimeType: "image/png",
	};
	try {
		var docFile = Drive.Files.insert(file, blob, { ocr: true });

		// Open the new Google Doc and get its text content
		var doc = DocumentApp.openById(docFile.id);
		var body = doc.getBody().getText();

		// Trash the newly created Google Doc after extracting its text content
		DriveApp.getFileById(docFile.id).setTrashed(true);
		return body;
	} catch (e) {
		Logger.log("Error processing file " + ": " + e.message);
		return null;
	}
}

function updatePageData() {
	var sheetapp = SpreadsheetApp.getActive();
	var pageDataSheet = sheetapp.getSheetByName("page_data");
	var uploadDataSheet = sheetapp.getSheetByName("upload");
	var uploads = uploadDataSheet
		.getRange(2, 1, uploadDataSheet.getLastRow() - 1, 6)
		.getValues();

	// Create a list of existing file IDs in page_data
	var fileIdsRange = pageDataSheet.getRange(
		2,
		2,
		pageDataSheet.getLastRow() - 1,
		1
	); // Assuming the file ID is in column 2 (B)
	var existingFileIds = fileIdsRange.getValues().map(function (row) {
		return row[0]; // Extract the file ID from the row array
	});

	// Array to hold new rows for bulk insertion
	var newRows = [];

	uploads.forEach(function (row) {
		var date = row[0];
		var fileName = row[1];
		var type = row[3];
		var fileId = row[5];
		Logger.log(fileId);
		Logger.log(type);
		// Check if the file is a PNG image and doesn't exist in pageDataSheet
		if (type === "image/png" && existingFileIds.indexOf(fileId) === -1) {
			Logger.log(type);
			var ocrText = ocrImageFiles(fileId);
			// Create a new link using the fileId
			var formattedLink =
				"https://drive.google.com/uc?export=view&id=" + fileId;
			// Prepare the link to be embedded as an image in Google Sheets
			var imageFormula = '=image("' + formattedLink + '")';

			newRows.push([fileId, fileName, imageFormula, "", "", "", "", ocrText]); // Collect new row
		} else if (
			type === "image/jpeg" &&
			existingFileIds.indexOf(fileId) === -1
		) {
			Logger.log(type);
			var ocrText = ocrImageFiles(fileId);
			// Create a new link using the fileId
			var formattedLink =
				"https://drive.google.com/uc?export=view&id=" + fileId;
			// Prepare the link to be embedded as an image in Google Sheets
			var imageFormula = '=image("' + formattedLink + '")';

			newRows.push([fileId, fileName, imageFormula, "", "", "", "", ocrText]); // Collect new row
		}
	});

	// Check if there are new rows to insert
	if (newRows.length > 0) {
		pageDataSheet.insertRowsBefore(2, newRows.length);
		var insertionRange = pageDataSheet.getRange(
			2,
			2,
			newRows.length,
			newRows[0].length
		);
		insertionRange.setValues(newRows);
	}
}
