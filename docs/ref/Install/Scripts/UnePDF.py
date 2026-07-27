# -*- coding: utf-8 -*-
import arcpy, os, time, sys, shutil
try:
    if len(sys.argv) >= 1:    
        Ruta = sys.argv [0]
        Cve_Ent = sys.argv [1]
        Cve_Mun = sys.argv [2]
        Cve_Loc = sys.argv[3]
        rutaProy = sys.argv[4]
        Prod = sys.argv[5]
        Tipo = sys.argv[6]
        img = sys.argv[7]
        ent = sys.argv[8]
        mun = sys.argv[9]
        loc = sys.argv[10]

##    Cve_Ent = "09"
##    Cve_Mun = "003"
##    Cve_Loc = "0001"
##    rutaProy = "D:\GEPROCEN"
##    Prod = "PLANODELOCALIDAD"
##    Tipo = "U"
##    img = "True"
##    ent = "Distrito Federal"
##    mun = "Coyoacán"
##    loc = "Coyoacán"
        
    Cve_Prod = Cve_Ent + Cve_Mun + Cve_Loc
    print Cve_Prod

    if Prod == "PLANODELOCALIDAD":
        nomArc = "PL" + Tipo + "_" + Cve_Prod
    elif Prod == "PLANORURAL":
        nomArc = "PAR_" + Cve_Prod
    elif Prod == "INDICEDEAGEBS":
        nomArc = "IA_" + Cve_Prod
    else:
        nomArc = ""
   
    if nomArc == "":
        print 'No es posible continuar '
    else:
        if img == "True":
            nomArc = nomArc + "_I"
            
        nomArc = nomArc + ".pdf"
        print nomArc
        rutaPDF = rutaProy
        #Set file name and remove if it already exists
        if Prod == "PLANORURAL":
            rutaPDF = os.path.join(rutaProy, "PDFS", Cve_Ent + " " + ent.replace("_", " "), Cve_Mun + " " + mun.replace("_", " "), "PAR")
        else:
            rutaPDF = os.path.join(rutaProy, "PDFS", Cve_Ent + " " + ent.replace("_", " "), Cve_Mun + " " + mun.replace("_", " "), Cve_Loc + " " + loc.replace("_", " "))
                                   
        rutaTemp = os.path.join(rutaPDF, "temp")  
        pdfPath = os.path.join(rutaPDF, nomArc)

        print rutaPDF
        print rutaTemp
        print pdfPath
                                   
        if os.path.exists(pdfPath):
            os.remove(pdfPath)

        #Create the file and append pages
        pdfDoc = arcpy.mapping.PDFDocumentCreate(pdfPath)
        listD = os.listdir(rutaTemp)
        for items in listD:
            print items
            pdfDoc.appendPages(os.path.join(rutaTemp, items))
        #Commit changes and delete variable reference
        pdfDoc.saveAndClose()
        del pdfDoc
        
        shutil.rmtree(rutaTemp)
    
except IOError as e:
    print "I/O error({0}): {1}".format(e.errno, e.strerror)
    time.sleep(40)
except ValueError:
    print "Could not convert data to an integer."
    time.sleep(40)
except:
    print "Unexpected error:", sys.exc_info()[0]
    time.sleep(40)
    raise

sys.exit(0)
