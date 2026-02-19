async function showNutritionChart() {
  const token = localStorage.getItem("token");

  const res = await fetch("http://localhost:5000/nutrition/data", {
    headers: { "Authorization": "Bearer " + token }
  });

  const data = await res.json();
  const labels = data.map(x => x.date);
  const calories = data.map(x => x.calories);

  new Chart(document.getElementById("nutritionChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Calories/day",
        data: calories,
        borderWidth: 2,
        tension: 0.4,
        fill: true
      }]
    }
  });
}
showNutritionChart();

async function startScanner() {
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.getElementById("scanner"),
      constraints: {
        facingMode: "environment"
      }
    },
    decoder: {
      readers: ["ean_reader"]
    }
  }, function(err) {
    if (err) {
      console.log(err);
      return;
    }
    Quagga.start();
    console.log("Scanner started");
  });

  Quagga.onDetected(async function(result) {
    const code = result.codeResult.code;
    console.log("Barcode detected: " + code);
    Quagga.stop();
    await fetchNutritionData(code);
  });
}
async function fetchNutritionData(barcode) {
  const token = localStorage.getItem("token");
  const res = await fetch(`https://api.barcodelookup.com/v3/products?barcode=${barcode}&formatted
=y&key=YOUR
_API_KEY`);
  const data = await res.json();
  if (data.products && data.products.length > 0) {
    const product = data.products[0];
    const ingredients = product.ingredients_text || "unknown ingredients";
    alert(`Product: ${product.product_name}\nIngredients: ${ingredients}`);
  } else {
    alert("Product not found");
  }
}
