
// https://github.com/jgthms/bulma/issues/238 thanks!
document.getElementById("nav-toggle").addEventListener("click", toggleNav);
function toggleNav() {
    var nav = document.getElementById("nav-menu");
    var className = nav.getAttribute("class");
    if(className == "nav-right nav-menu") {
        nav.className = "nav-right nav-menu is-active";
    } else {
        nav.className = "nav-right nav-menu";
    }
}

// for the random quote in the header
var txtFile = new XMLHttpRequest();
txtFile.open("GET", "/quotes.txt", true);
txtFile.onreadystatechange = function () {
    if (txtFile.readyState === 4) {
        if (txtFile.status === 200) {
            allText = txtFile.responseText;
            lines = txtFile.responseText.split("\n");
            randLine = lines[Math.floor((Math.random() * lines.length) + 1)];
            document.getElementById('quote').innerHTML = randLine ||
                "Intelligence is the ability to adapt to change."; // fallback quote
        }
    }
};
txtFile.send(null);

document.getElementById("search-text").addEventListener("keydown", function(e) {
    // search
    if (e.keyCode == 13) { searchHandler(); }
}, false);

function searchHandler() {
    var searchInput = document.getElementById('search-text');
    var text = searchInput.value;
    // add site:example.com in the placeholder
    window.location.href = "https://www.google.com/search?q=site:nagekar.com " + text;
}