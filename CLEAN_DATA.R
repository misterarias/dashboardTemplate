# No queremos emponzoñar la ejecución con variables de anteriores
rm(list = ls()) 

datasets <- list()
raw_data.dir = "raw_data/"
destination_data.dir = "data/"
common.fields <- c("HAS_ERROR", "ID_PROCESO", "FECHA_INICIO", "NUMERO_AUTOS", "IMPORTE_RECLA_UNIQ")

filenames = list( "demandas" = "VALID_FASE_DEMANDA.csv",
                  "subastas" = "VALID_SUBASTAS.CSV",
                  "adjudicaciones" = "VALID_ADJUDICACIONES.CSV",
                  "requerimientos" = "VALID_REQ_PERSONAS.CSV"
                  )

datasets[["adjudicaciones"]] <- c(common.fields)
datasets[["demandas"]] <- c(common.fields, c("FEC_ADMISION", "FEC_PRESENTA_DEM", "ID_JUZGADO", "COSTAS"))
datasets[["requerimientos"]] <- c(common.fields, c("FECHA_CARGAS_REG", "FECHA_REQ_PAGO", "RES_REQUER", "OFICIOS", "OPOSICION"))
datasets[["subastas"]] <- c(common.fields, c("RES_SUBASTA", "FEC_CELEB_SUB", "AA_SUBASTA_IMP_ADJ"))

for (tipo_fase in names(filenames)) {
    
    input.csv.file.name <- paste0(raw_data.dir, filenames[tipo_fase])
    
    json.file.name <- paste0(destination_data.dir, tipo_fase, ".json")
    output.csv.file.name <- paste0(destination_data.dir, tipo_fase, ".csv")
    final.fields = datasets[[tipo_fase]]

    # no icluir otros procedimientos
    df <- read.csv(input.csv.file.name, sep = "|", header = TRUE, stringsAsFactors = FALSE)
    
    # Clean stuff
    df$IMPORTE_RECLA[df$IMPORTE_RECLA == "" | is.na(df$IMPORTE_RECLA)] <- 0
    df$IMPORTE_RECLA_CLEAN <- as.numeric(gsub(',', '.', df$IMPORTE_RECLA))
    df$IMPORTE_RECLA_CLEAN[is.na(df$IMPORTE_RECLA_CLEAN)] <- 0
    df$MAX_IMPORT_GROUP <- ave(df$IMPORTE_RECLA_CLEAN, df$ID_PROCESO, FUN = max)
    df$FIRST_ENTRY <- as.numeric(!duplicated(df[c("ID_PROCESO", "MAX_IMPORT_GROUP")]))
    df$IMPORTE_RECLA_UNIQ <- with(df, MAX_IMPORT_GROUP * FIRST_ENTRY)

    rules.fields <- names(df)[grep("*_R[0-9]+", names(df))]
    df.rules <- df[rules.fields]
    
    # no queremos considerar éstas
    ignore.rules <- c("N_IMP_INT_R67", "N_IMP_COSTAS_R68", "FEC_SOLICITADA_EPO_R19")
    # ni errores que incluyan mas del x% de los resultados
    colsums <- colSums(df.rules)
    umbral <- 0.4 * nrow(df) # ~ 40%
    remove.rules <- names(colsums[ colsums > umbral])
    
    ignore.rules <- unique(c(ignore.rules, remove.rules))
    df.rules[, ignore.rules] <- 0
    
    df$HAS_ERROR <- rowSums(df.rules) > 0
    my_df <- df[final.fields]

    # json es mas del doble de grande que un csv limpio
   # library(jsonlite)
  #  df.json <- toJSON(my_df)
   # write(toJSON(my_df), json.file.name)

    write.csv(my_df, file = output.csv.file.name)
    print(paste0("Cleaned file: ", input.csv.file.name))
}

print("Listo!")