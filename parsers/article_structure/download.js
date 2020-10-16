module.exports = {
    processDownloadStructure: (parsedContent) => {
        let resultingHTML = '';
        let usedDonors = [];
        const MAX_DONORS = 3;
        // merge texts
        for (let key in parsedContent) {
            if (parsedContent.hasOwnProperty(key)) {
                let content = "<div class='content-block-start'><!-- START BLOCK, SRC: [" + key + "] --></div>" + parsedContent[key].content + "<div class='content-block-end'><!-- END BLOCK, SRC: [" + key + "] --></div>";
                resultingHTML = content + '<br>' + resultingHTML;
                usedDonors.push(key);

                if (usedDonors.length >= MAX_DONORS){
                    break;
                }
            }
        }

        resultingHTML += `<div class='dload-btn-container'><a class="button7" href='/wp-content/uploads/installer.zip'>Скачать</a></div>`;

        return [resultingHTML, usedDonors];
    }
}