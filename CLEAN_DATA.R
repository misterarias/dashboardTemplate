datasets <- list()
common.fields <- c("HAS_ERROR", "ID_PROCESO", "FECHA_INICIO", "NUMERO_AUTOS", "IMPORTE_RECLA_UNIQ")
datasets[["demandas"]] <- c(common.fields, c("FEC_ADMISION", "FEC_PRESENTA_DEM", "ID_JUZGADO", "COSTAS"))
datasets[["adjudicaciones"]] <- c(common.fields)
datasets[["requerimientos"]] <- c(common.fields, c("FECHA_CARGAS_REG", "FECHA_REQ_PAGO", "RES_REQUER", "OFICIOS", "OPOSICION"))
datasets[["subastas"]] <- c(common.fields, c("RES_SUBASTA", "FEC_CELEB_SUB", "AA_SUBASTA_IMP_ADJ"))

for (tipo_fase in names(datasets)) {
  
  json.file.name <- paste0("data/", tipo_fase, ".json")
  csv.file.name <- paste0("data/", tipo_fase, ".csv")
  final.fields = datasets[[tipo_fase]]
  
  df <- read.csv(csv.file.name, sep = "|", header = TRUE) #, stringsAsFactors = FALSE)
  
  # New Columns
  df$IMPORTE_RECLA <- as.numeric(gsub(',', '.', df$IMPORTE_RECLA))
  df$MAX_IMPORT_GROUP <- ave(df$IMPORTE_RECLA, df$ID_PROCESO, FUN = max)
  df$FIRST_ENTRY <- as.numeric(!duplicated(df[c("ID_PROCESO", "MAX_IMPORT_GROUP")]))
  df$IMPORTE_RECLA_UNIQ <- with(df, MAX_IMPORT_GROUP * FIRST_ENTRY)

  df$GASTOS <- as.numeric(gsub(',', '.', df$GASTOS))
  #df$OPOSICION[df$OPOSICION == ""] <- "?"
  
  df$FEC_SOLICITADA_EPO_R19 <- 0
  rules.fields = names(df)[grep("*_R[0-9]+", names(df))]
  df.rules <- df[rules.fields]
  df.rules$FEC_SOLICITADA_EPO_R19 <- 0
  
  df$HAS_ERROR <- rowSums(df.rules) > 0
  my_df <- df[final.fields]
  
  library(jsonlite)
  df.json <- toJSON(my_df)
  write(toJSON(my_df), json.file.name)
  print(paste0("Created JSON: ", json.file.name))
}