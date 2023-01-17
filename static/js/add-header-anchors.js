(function(){
    $("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]").each(function(a, i){
        let t = document.location.href
        t = t.substring(0, t.indexOf(window.location.hash) || t.length)
        const e = $(document.createElement("a")).attr({
            class : "anchorizer text-secondary",
            href: t + "#" + i.id,
            title : "Permalink to this section"
        }).html($(document.createElement("i")).attr("class", "fa fa-link"));
        $(i).append(e)
    })
})()